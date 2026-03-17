#!/usr/bin/env python3
"""
Enhance building GeoJSON with heights from DGT LiDAR MDS tiles.

For buildings without OSM height data, samples the MDS (Digital Surface Model)
to get accurate building heights from LiDAR.

Usage:
  python3 scripts/enhance-buildings-lidar.py
"""

import json
import sys
from pathlib import Path
from typing import Optional, Tuple
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
from shapely.geometry import Polygon, Point

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MDS_RAW_DIR = PROJECT_ROOT / "data" / "mds-raw"
INPUT_FILE = Path("/tmp/lisbon-buildings.geojson")
OUTPUT_FILE = PROJECT_ROOT / "src" / "data" / "lisbon-buildings.json"

# Coordinate transformer: WGS84 -> EPSG:3763 (PT-TM06)
transformer = Transformer.from_crs("EPSG:4326", "EPSG:3763", always_xy=True)

# Cache for loaded tiles
tile_cache: dict[str, rasterio.DatasetReader] = {}


def get_tile_id(x: float, y: float) -> str:
    """Get MDS tile ID for EPSG:3763 coordinates."""
    col = int(x // 1000) + 200
    row = int(y // 1000) + 300
    return f"{col:03d}{row:03d}"


def load_tile(tile_id: str) -> Optional[rasterio.DatasetReader]:
    """Load an MDS tile, with caching."""
    if tile_id in tile_cache:
        return tile_cache[tile_id]
    
    # Find tile file
    pattern = f"MDS-50cm-{tile_id}-*.tif"
    matches = list(MDS_RAW_DIR.glob(pattern))
    if not matches:
        return None
    
    ds = rasterio.open(matches[0])
    tile_cache[tile_id] = ds
    return ds


def sample_height(lng: float, lat: float) -> Optional[float]:
    """Sample elevation from MDS tile at given WGS84 coordinates."""
    # Convert to EPSG:3763
    x, y = transformer.transform(lng, lat)
    
    # Get tile
    tile_id = get_tile_id(x, y)
    ds = load_tile(tile_id)
    if ds is None:
        return None
    
    # Convert to pixel coordinates
    # Tile origin: X_origin = (col - 200) * 1000, Y_origin = (row - 300) * 1000
    col = int(tile_id[:3])
    row = int(tile_id[3:])
    x_origin = (col - 200) * 1000
    y_origin = (row - 300) * 1000
    
    # MDS is 2000x2000 pixels at 0.5m resolution = 1000m x 1000m
    # Origin is bottom-left, Y increases upward in EPSG:3763
    px = int((x - x_origin) / 0.5)
    py = int((y_origin + 1000 - y) / 0.5)  # Flip Y (raster origin is top-left)
    
    if px < 0 or px >= 2000 or py < 0 or py >= 2000:
        return None
    
    try:
        window = Window(px, py, 1, 1)
        data = ds.read(1, window=window)
        val = float(data[0, 0])
        if val < -100 or val > 500:  # Sanity check
            return None
        return val
    except Exception:
        return None


def get_building_height(feature: dict) -> float:
    """
    Get building height by sampling MDS at building centroid and corners,
    then subtracting ground level estimate.
    """
    coords = feature["geometry"]["coordinates"][0]
    poly = Polygon(coords)
    centroid = poly.centroid
    
    # Sample centroid
    roof_height = sample_height(centroid.x, centroid.y)
    if roof_height is None:
        return 10.0  # Default
    
    # Sample corners for ground level (take minimum as ground)
    ground_samples = []
    for coord in coords[:4]:  # First 4 corners
        # Sample slightly outside the building for ground
        dx = coord[0] - centroid.x
        dy = coord[1] - centroid.y
        outside_x = coord[0] + dx * 0.5
        outside_y = coord[1] + dy * 0.5
        h = sample_height(outside_x, outside_y)
        if h is not None:
            ground_samples.append(h)
    
    if not ground_samples:
        # Fallback: assume roof height is building height (ground = 0)
        # This is approximate but better than nothing
        return max(3.0, min(roof_height, 100.0))
    
    ground_level = min(ground_samples)
    building_height = roof_height - ground_level
    
    # Sanity bounds
    return max(3.0, min(building_height, 150.0))


def main():
    print(f"Loading buildings from {INPUT_FILE}...")
    with open(INPUT_FILE) as f:
        data = json.load(f)
    
    features = data["features"]
    total = len(features)
    need_lidar = sum(1 for f in features if not f["properties"]["hasOsmHeight"])
    
    print(f"Total buildings: {total}")
    print(f"Already have OSM height: {total - need_lidar}")
    print(f"Need LiDAR enhancement: {need_lidar}")
    print()
    
    enhanced = 0
    failed = 0
    
    for i, feature in enumerate(features):
        if i % 5000 == 0:
            print(f"Processing {i}/{total}...")
        
        # Skip if already has OSM height
        if feature["properties"]["hasOsmHeight"]:
            continue
        
        try:
            height = get_building_height(feature)
            feature["properties"]["height"] = round(height, 1)
            feature["properties"]["heightSource"] = "lidar"
            enhanced += 1
        except Exception as e:
            # Keep default height
            feature["properties"]["heightSource"] = "default"
            failed += 1
    
    print(f"\nEnhanced with LiDAR: {enhanced}")
    print(f"Failed (using default): {failed}")
    
    # Remove intermediate flag
    for f in features:
        if "hasOsmHeight" in f["properties"]:
            if f["properties"]["hasOsmHeight"]:
                f["properties"]["heightSource"] = "osm"
            del f["properties"]["hasOsmHeight"]
    
    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(data, f)
    
    size_mb = OUTPUT_FILE.stat().st_size / 1024 / 1024
    print(f"\nWrote {OUTPUT_FILE} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
