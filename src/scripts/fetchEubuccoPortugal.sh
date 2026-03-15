#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$BASE_DIR/tmp/eubucco"
ZIP_PATH="$OUT_DIR/v0_1-PRT.gpkg.zip"
GPKG_PATH="$OUT_DIR/v0_1-PRT.gpkg"
URL="https://api.eubucco.com/v0.1/files/2f460d4c-967a-42f1-a540-2afdf14d17f5/download"

mkdir -p "$OUT_DIR"

if [ ! -f "$ZIP_PATH" ]; then
  echo "Downloading Portugal EUBUCCO GPKG zip..."
  curl -L "$URL" -o "$ZIP_PATH"
else
  echo "Zip already present: $ZIP_PATH"
fi

if [ ! -f "$GPKG_PATH" ]; then
  echo "Unzipping GPKG..."
  unzip -o "$ZIP_PATH" -d "$OUT_DIR"
else
  echo "GPKG already present: $GPKG_PATH"
fi

echo "Done: $GPKG_PATH"
