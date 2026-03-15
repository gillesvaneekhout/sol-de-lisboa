#!/usr/bin/env python3
"""
LiDAR Shadow Pipeline — computes per-venue shadow schedules from MDS-50cm tiles.

Usage:
  python3 scripts/process-lidar.py                    # process all venues
  python3 scripts/process-lidar.py cafe-a-brasileira   # process single venue
  python3 scripts/process-lidar.py --parallel 8        # parallel processing

The pipeline:
  1. Loads venue data from src/data/terraces.json
  2. Crops ~300m radius elevation windows from MDS tiles (cached in data/mds-venue/)
  3. For each venue, casts shadow rays for every hour (7-21) x month (1-12)
  4. Outputs shadow schedules to src/data/shadow-schedules/{venue-id}.json

Tile grid: MDS-50cm tiles use EPSG:3763 (ETRS89/PT-TM06).
  Tile ID CCCRRR → X_origin = (CCC - 200) * 1000, Y_origin = (RRR - 300) * 1000
  Each tile: 2000×2000 pixels, 0.5m/pixel, 1000m × 1000m

DGT STAC API for fetching new tiles:
  https://cdd.dgterritorio.gov.pt/dgt-be/v1/collections/MDS-50cm/items/MDS-50cm-{tileId}-07-2024
"""

import argparse
import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
from pysolar.solar import get_altitude, get_azimuth

# ── Paths ──────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TERRACES_JSON = PROJECT_ROOT / "src" / "data" / "terraces.json"
MDS_RAW_DIR = PROJECT_ROOT / "data" / "mds-raw"
MDS_VENUE_DIR = PROJECT_ROOT / "data" / "mds-venue"
SHADOW_OUT_DIR = PROJECT_ROOT / "src" / "data" / "shadow-schedules"

# ── Constants ──────────────────────────────────────────────────────────────────
CROP_RADIUS_M = 300          # meters around venue to crop
RAY_STEP_M = 0.5             # sampling step along shadow ray
RAY_START_M = 5.0            # skip immediate surroundings (venue's own building roof in MDS)
RAY_MAX_M = 300              # max distance to cast ray
NODATA = -999.0
HOURS = list(range(7, 22))   # 7:00 through 21:00
MONTHS = list(range(1, 13))
# Representative day per month (15th)
REP_DAY = 15

# Lisbon DST: last Sunday of March → last Sunday of October = WEST (UTC+1)
# Otherwise WET (UTC+0). We compute in UTC, display in local.
# For representative days on the 15th, DST months are April–October (months 4-10).
DST_MONTHS = set(range(4, 11))  # April through October

# EPSG:3763 ↔ WGS84
transformer_to_3763 = Transformer.from_crs("EPSG:4326", "EPSG:3763", always_xy=True)
transformer_to_4326 = Transformer.from_crs("EPSG:3763", "EPSG:4326", always_xy=True)


def tile_id_from_xy(x: float, y: float) -> str:
    """Given EPSG:3763 coordinates, return the 6-digit MDS tile ID.
    Tile origin is upper-left: X grows right (floor), Y grows downward (ceil)."""
    col = int(math.floor(x / 1000)) + 200
    row = int(math.ceil(y / 1000)) + 300
    return f"{col:03d}{row:03d}"


def tile_filename(tile_id: str) -> str:
    return f"MDS-50cm-{tile_id}-07-2024_v01.tif"


def tiles_in_radius(cx: float, cy: float, radius: float) -> set:
    """Return set of tile IDs that overlap a circle at (cx, cy) with given radius."""
    ids = set()
    for dx in [-radius, 0, radius]:
        for dy in [-radius, 0, radius]:
            ids.add(tile_id_from_xy(cx + dx, cy + dy))
    return ids


def load_venues(venue_id: str = None) -> list:
    with open(TERRACES_JSON) as f:
        venues = json.load(f)
    if venue_id:
        venues = [v for v in venues if v["id"] == venue_id]
        if not venues:
            print(f"ERROR: venue '{venue_id}' not found in terraces.json")
            sys.exit(1)
    return venues


def crop_venue_elevation(venue: dict) -> Path:
    """Extract a ~300m radius elevation window around a venue. Returns path to cropped GeoTIFF."""
    vid = venue["id"]
    crop_path = MDS_VENUE_DIR / f"{vid}.tif"

    if crop_path.exists():
        return crop_path

    # Get venue coordinates in EPSG:3763
    lat = venue.get("terraceLat", venue["lat"])
    lng = venue.get("terraceLng", venue["lng"])
    vx, vy = transformer_to_3763.transform(lng, lat)

    # Find which tiles we need
    needed_tiles = tiles_in_radius(vx, vy, CROP_RADIUS_M)

    # Build a merged elevation array covering the crop window
    xmin = vx - CROP_RADIUS_M
    xmax = vx + CROP_RADIUS_M
    ymin = vy - CROP_RADIUS_M
    ymax = vy + CROP_RADIUS_M

    # Output grid: 0.5m resolution
    cols = int((xmax - xmin) / 0.5)
    rows = int((ymax - ymin) / 0.5)
    merged = np.full((rows, cols), NODATA, dtype=np.float32)

    for tid in needed_tiles:
        tile_path = MDS_RAW_DIR / tile_filename(tid)
        if not tile_path.exists():
            continue

        with rasterio.open(tile_path) as src:
            # Tile bounds in EPSG:3763
            t = src.transform
            tile_xmin = t.c
            tile_ymax = t.f  # upper-left Y (Y decreases downward)
            tile_xmax = tile_xmin + src.width * t.a
            tile_ymin = tile_ymax + src.height * t.e  # t.e is negative

            # Overlap between crop window and tile
            ox_min = max(xmin, tile_xmin)
            ox_max = min(xmax, tile_xmax)
            oy_min = max(ymin, tile_ymin)
            oy_max = min(ymax, tile_ymax)

            if ox_min >= ox_max or oy_min >= oy_max:
                continue

            # Pixel coordinates in source tile (row 0 = top = ymax)
            src_col_off = int((ox_min - tile_xmin) / 0.5)
            src_row_off = int((tile_ymax - oy_max) / 0.5)
            src_width = int((ox_max - ox_min) / 0.5)
            src_height = int((oy_max - oy_min) / 0.5)

            window = Window(src_col_off, src_row_off, src_width, src_height)
            data = src.read(1, window=window)

            # Position in merged array
            dst_col_off = int((ox_min - xmin) / 0.5)
            dst_row_off = int((ymax - oy_max) / 0.5)

            # Handle potential size mismatches at edges
            h, w = data.shape
            merged[dst_row_off:dst_row_off + h, dst_col_off:dst_col_off + w] = data

    # Write cropped GeoTIFF
    from rasterio.transform import from_bounds
    transform = from_bounds(xmin, ymin, xmax, ymax, cols, rows)

    MDS_VENUE_DIR.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        crop_path, "w",
        driver="GTiff",
        height=rows, width=cols,
        count=1, dtype="float32",
        crs="EPSG:3763",
        transform=transform,
        nodata=NODATA,
        compress="deflate",
    ) as dst:
        dst.write(merged, 1)

    return crop_path


def get_observer_height(venue: dict, elevation_at_point: float) -> float:
    """Get the observer elevation (absolute, in meters above sea level).
    Uses terraceFloor if set, otherwise MDS elevation + 1m (ground floor assumption)."""
    floor = venue.get("terraceFloor")
    if floor is not None:
        # terraceFloor is the floor number (0=ground, 1=first, etc.)
        # Estimate ~3m per floor above ground elevation
        # But we need ground elevation — MDS includes the building, so we use a rough estimate
        return elevation_at_point + floor * 3.0
    # No floor info: assume observer is at MDS elevation + 1m (standing on ground/terrace)
    return elevation_at_point + 1.0


def sun_position_utc(year: int, month: int, day: int, hour_utc: float, lat: float, lng: float):
    """Return (altitude_deg, azimuth_deg) for given UTC time and location."""
    dt = datetime(year, month, day, int(hour_utc), 0, 0, tzinfo=timezone.utc)
    alt = get_altitude(lat, lng, dt)
    azi = get_azimuth(lat, lng, dt)
    return alt, azi


def is_shaded(data: np.ndarray, crop_xmin: float, crop_ymax: float,
              vx: float, vy: float, observer_elev: float,
              sun_alt_deg: float, sun_azi_deg: float) -> bool:
    """Cast a ray from venue toward the sun. Return True if shaded.
    data/crop_xmin/crop_ymax are pre-loaded from the crop GeoTIFF."""
    if sun_alt_deg <= 0:
        return True  # sun below horizon

    # Sun azimuth: pysolar uses north=0, east=90
    # We need to cast ray TOWARD the sun, so direction = azimuth
    azi_rad = math.radians(sun_azi_deg)
    alt_rad = math.radians(sun_alt_deg)

    # Direction vector (east=+X, north=+Y in EPSG:3763)
    dx = math.sin(azi_rad)  # east component
    dy = math.cos(azi_rad)  # north component

    # Height gain per meter of horizontal distance
    tan_alt = math.tan(alt_rad)

    rows, cols = data.shape
    step = RAY_STEP_M
    dist = RAY_START_M  # skip venue's own building footprint
    while dist <= RAY_MAX_M:
        # Point along ray
        px = vx + dx * dist
        py = vy + dy * dist

        # Height threshold: the sun ray at this distance has risen by tan(alt) * dist
        required_height = observer_elev + tan_alt * dist

        # Convert to pixel coordinates
        col = int((px - crop_xmin) / 0.5)
        row = int((crop_ymax - py) / 0.5)

        if 0 <= row < rows and 0 <= col < cols:
            elev = data[row, col]
            if elev != NODATA and elev > required_height:
                return True
        else:
            break  # outside crop window

        dist += step

    return False


def compute_shadow_schedule(venue: dict) -> dict:
    """Compute full shadow schedule for a venue."""
    vid = venue["id"]
    lat = venue.get("terraceLat", venue["lat"])
    lng = venue.get("terraceLng", venue["lng"])

    # Step 1: crop elevation
    crop_path = crop_venue_elevation(venue)

    # Step 2: get venue elevation from MDS — load data once for all ray casts
    vx, vy = transformer_to_3763.transform(lng, lat)
    with rasterio.open(crop_path) as src:
        row, col = src.index(vx, vy)
        data = src.read(1)
        crop_xmin = src.transform.c
        crop_ymax = src.transform.f

        if 0 <= row < data.shape[0] and 0 <= col < data.shape[1]:
            venue_elev = float(data[row, col])
            if venue_elev == NODATA:
                venue_elev = 50.0  # fallback for Lisboa
        else:
            venue_elev = 50.0

    observer_elev = get_observer_height(venue, venue_elev)

    # Step 3: compute for each month × hour using pre-loaded elevation data
    schedule = {}
    year = 2026  # reference year

    for month in MONTHS:
        month_schedule = {}
        for hour_local in HOURS:
            # Convert local time to UTC
            utc_offset = 1 if month in DST_MONTHS else 0
            hour_utc = hour_local - utc_offset

            sun_alt, sun_azi = sun_position_utc(year, month, REP_DAY, hour_utc, lat, lng)

            if sun_alt <= 0:
                month_schedule[str(hour_local)] = "below_horizon"
            else:
                shaded = is_shaded(data, crop_xmin, crop_ymax,
                                   vx, vy, observer_elev, sun_alt, sun_azi)
                month_schedule[str(hour_local)] = "shade" if shaded else "sun"

        schedule[str(month)] = month_schedule

    return {
        "venueId": vid,
        "lat": lat,
        "lng": lng,
        "elevationMsl": round(venue_elev, 1),
        "observerElevation": round(observer_elev, 1),
        "computedAt": datetime.now().strftime("%Y-%m-%d"),
        "schedule": schedule,
    }


def process_venue(venue: dict) -> str:
    """Process a single venue. Returns status message."""
    vid = venue["id"]
    try:
        result = compute_shadow_schedule(venue)
        out_path = SHADOW_OUT_DIR / f"{vid}.json"
        SHADOW_OUT_DIR.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)

        # Count sun/shade/below_horizon
        sun_count = shade_count = below_count = 0
        for m in result["schedule"].values():
            for v in m.values():
                if v == "sun":
                    sun_count += 1
                elif v == "shade":
                    shade_count += 1
                else:
                    below_count += 1

        return f"  ✓ {vid}: elev={result['elevationMsl']}m, sun={sun_count}, shade={shade_count}, below={below_count}"
    except Exception as e:
        return f"  ✗ {vid}: {e}"


def main():
    parser = argparse.ArgumentParser(description="LiDAR shadow pipeline for terrace venues")
    parser.add_argument("venue_id", nargs="?", help="Process a single venue by ID")
    parser.add_argument("--parallel", type=int, default=1, help="Number of parallel workers")
    parser.add_argument("--force", action="store_true", help="Force re-crop even if cached")
    parser.add_argument("--list-tiles", action="store_true", help="List available MDS tiles and exit")
    args = parser.parse_args()

    if args.list_tiles:
        print("Available MDS tiles:")
        for p in sorted(MDS_RAW_DIR.glob("MDS-50cm-*.tif")):
            tid = p.stem.split("-")[2]
            with rasterio.open(p) as src:
                b = src.bounds
            print(f"  {tid}: x=[{b.left:.0f}, {b.right:.0f}] y=[{b.bottom:.0f}, {b.top:.0f}]")
        return

    venues = load_venues(args.venue_id)
    print(f"Processing {len(venues)} venue(s)...")
    print(f"MDS tiles available: {len(list(MDS_RAW_DIR.glob('MDS-50cm-*.tif')))}")

    if args.force:
        for v in venues:
            crop = MDS_VENUE_DIR / f"{v['id']}.tif"
            if crop.exists():
                crop.unlink()

    if args.parallel > 1 and len(venues) > 1:
        print(f"Using {args.parallel} parallel workers")
        with ProcessPoolExecutor(max_workers=args.parallel) as executor:
            futures = {executor.submit(process_venue, v): v["id"] for v in venues}
            for future in as_completed(futures):
                print(future.result())
    else:
        for v in venues:
            print(process_venue(v))

    # Summary
    schedules = list(SHADOW_OUT_DIR.glob("*.json"))
    print(f"\nDone! {len(schedules)} shadow schedules written to {SHADOW_OUT_DIR.relative_to(PROJECT_ROOT)}/")


if __name__ == "__main__":
    main()
