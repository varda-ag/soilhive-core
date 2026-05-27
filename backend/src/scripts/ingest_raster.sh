#!/usr/bin/env bash
# ingest_raster.sh — Convert a GeoTIFF to Cloud Optimized GeoTIFF (COG) and
# print the output path to stdout.  All other steps (metadata extraction,
# footprint computation, DB insert) are handled by the TypeScript ingest service.
#
# Usage:
#   ./scripts/ingest_raster.sh [OPTIONS] <input.tif>
#
# Options:
#   -o, --out         Output COG filename (default: <basename(input)>_cog.tif)
#   -O, --out-dir     Root folder prepended to --out (or the default filename)
#       --resampling  GDAL overview resampling: AVERAGE (default) | NEAREST
#                     Use NEAREST for categorical data (soil texture, etc.)
#   -h, --help        Show this help
#
# Dependencies: gdal_translate, gdalinfo, jq

set -euo pipefail

OUT=""
OUT_EXPLICIT="false"
OUTDIR=""
RESAMPLING="AVERAGE"
INPUT=""

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--out)       OUT="$2"; OUT_EXPLICIT="true"; shift 2 ;;
    -O|--out-dir)   OUTDIR="$2"; shift 2 ;;
    --resampling)   RESAMPLING="$2"; shift 2 ;;
    -h|--help)      usage ;;
    -*)             echo "Unknown option: $1" >&2; exit 1 ;;
    *)              INPUT="$1"; shift ;;
  esac
done

[[ -z "$INPUT" ]] && { echo "Error: input file required" >&2; exit 1; }
[[ ! -f "$INPUT" ]] && { echo "Error: file not found: $INPUT" >&2; exit 1; }

for cmd in gdal_translate gdalinfo jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd not found in PATH" >&2; exit 1; }
done

[[ -z "$OUT" ]] && OUT="$(basename "${INPUT%.tif}")_cog.tif"
[[ -n "$OUTDIR" ]] && OUT="${OUTDIR%/}/$OUT"

IS_COG=$(gdalinfo -json "$INPUT" 2>/dev/null | jq -r '
  if .metadata[""].LAYOUT == "COG" then "COG"
  elif ((.bands[0].block // [0])[0] >= 256) and ((.bands[0].overviews // []) | length > 0) then "COG"
  else "" end
' 2>/dev/null || true)

if [[ "$IS_COG" == "COG" && "$OUT_EXPLICIT" != "true" ]]; then
  echo "-> Skipping COG conversion: input is already COG" >&2
  OUT="$INPUT"
elif [[ "$IS_COG" == "COG" ]]; then
  echo "-> Input is already COG, copying to: $OUT" >&2
  cp "$INPUT" "$OUT" >&2
else
  echo "-> Converting to COG: $OUT" >&2
  gdal_translate "$INPUT" "$OUT" \
    -of COG \
    -co COMPRESS=DEFLATE \
    -co BLOCKSIZE=512 \
    -co OVERVIEWS=AUTO \
    -co BIGTIFF=YES \
    -co "OVERVIEW_RESAMPLING=$RESAMPLING" >&2
fi

echo "$OUT"
