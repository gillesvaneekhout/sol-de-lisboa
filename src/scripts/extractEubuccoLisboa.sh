#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$BASE_DIR/tmp/eubucco"
GPKG_PATH="$OUT_DIR/v0_1-PRT.gpkg"
LISBOA_GPKG="$OUT_DIR/lisboa-eubucco.gpkg"
LISBOA_CSV_3035="$OUT_DIR/lisboa-eubucco-3035.csv"
LISBOA_CSV_WGS84="$OUT_DIR/lisboa-eubucco-wgs84.csv"
CITY_PREFIX="v0.1-PRT.12.7_1"

if [ ! -f "$GPKG_PATH" ]; then
  echo "Missing $GPKG_PATH. Run fetchEubuccoPortugal.sh first."
  exit 1
fi

echo "Layers in source GPKG:"
ogrinfo -so "$GPKG_PATH" | sed -n '1,80p'

echo "Attempting Lisboa extraction by id prefix: $CITY_PREFIX"

# First layer name is likely same as file stem; discover robustly.
LAYER=$(ogrinfo -ro "$GPKG_PATH" 2>/dev/null | awk -F': ' '/^[0-9]+: /{print $2; exit}' | sed 's/ (Polygon)$//' | sed 's/ (Multi Polygon)$//')
if [ -z "$LAYER" ]; then
  echo "Could not detect layer name"
  exit 1
fi

echo "Using layer: $LAYER"

ogr2ogr -overwrite -f GPKG "$LISBOA_GPKG" "$GPKG_PATH" "$LAYER" \
  -dialect SQLITE \
  -sql "SELECT * FROM '$LAYER' WHERE id LIKE '${CITY_PREFIX}%'"

ogr2ogr -overwrite -f CSV "$LISBOA_CSV_3035" "$LISBOA_GPKG" \
  -lco GEOMETRY=AS_WKT

ogr2ogr -overwrite -t_srs EPSG:4326 -f CSV "$LISBOA_CSV_WGS84" "$LISBOA_GPKG" \
  -lco GEOMETRY=AS_WKT

echo "Created:"
ls -lh "$LISBOA_GPKG" "$LISBOA_CSV_3035" "$LISBOA_CSV_WGS84"
