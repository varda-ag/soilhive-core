#!/usr/bin/env bash
# convert_raster.sh — Convert a GeoTIFF to Cloud Optimized GeoTIFF (COG) and
# print the output path to stdout.  All other steps (metadata extraction,
# footprint computation, DB insert) are handled by the TypeScript ingest service.
#
# Usage:
#   ./scripts/convert_raster.sh [OPTIONS] <input.tif>
#
# Options:
#   -o, --out         Output COG filename (default: <basename(input)>_cog.tif)
#       --resampling  GDAL overview resampling: AVERAGE (default) | NEAREST
#                     Use NEAREST for categorical data (soil texture, etc.)
#       --conversion_factor  Multiply all pixels by a factor to convert to standard unit of measurement.
#   -h, --help        Show this help
#
# Dependencies: gdal_translate, gdalinfo, jq

set -euo pipefail

OUT=""
OUT_EXPLICIT="false"
OUTDIR=""
RESAMPLING="AVERAGE"
INPUT=""
SCALE=""

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--out)       OUT="$2"; OUT_EXPLICIT="true"; shift 2 ;;
    --resampling)   RESAMPLING="$2"; shift 2 ;;
    --conversion_factor)   SCALE="$2"; shift 2 ;;
    -h|--help)      usage ;;
    -*)             echo "Unknown option: $1" >&2; exit 1 ;;
    *)              INPUT="$1"; shift ;;
  esac
done

[[ -z "$INPUT" ]] && { echo "Error: input file required" >&2; exit 1; }
[[ ! -f "$INPUT" ]] && { echo "Error: file not found: $INPUT" >&2; exit 1; }

for cmd in gdal_translate gdalinfo gdal_edit.py jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd not found in PATH" >&2; exit 1; }
done

[[ -z "$OUT" ]] && OUT="$(basename "${INPUT%.tif}")_cog.tif"

TRANSLATE_SRC="$INPUT"
UNSCALE_ARGS=()

if [[ -n "$SCALE" ]]; then
  echo "-> Applying conversion factor $SCALE" >&2
  GDAL_CACHEMAX=512 gdal_translate -of VRT "$INPUT" ./tmp.vrt
  GDAL_CACHEMAX=512 gdal_edit.py -scale "$SCALE" -offset 0 ./tmp.vrt
  TRANSLATE_SRC="./tmp.vrt"
  UNSCALE_ARGS=(-unscale -ot Float32)
fi

IS_COG=$(gdalinfo -json "$INPUT" 2>/dev/null | jq -r '
  if .metadata[""].LAYOUT == "COG" then "COG"
  elif ((.bands[0].block // [0,0])[0] >= 256) and ((.bands[0].block // [0,0])[1] >= 256) and ((.bands[0].overviews // []) | length > 0) then "COG"
  else "" end
' 2>/dev/null || true)

if [[ "$IS_COG" == "COG" && -z "$SCALE" && "$OUT_EXPLICIT" != "true" ]]; then
  echo "-> Skipping COG conversion: input is already COG" >&2
  OUT="$INPUT"
elif [[ "$IS_COG" == "COG" && -z "$SCALE" ]]; then
  echo "-> Input is already COG and no conversion is needed, using input as output: $INPUT" >&2
  OUT="$INPUT"
else
  echo "-> Converting to COG: $OUT" >&2
  gdal_translate "$TRANSLATE_SRC" "$OUT" \
    --config GDAL_CACHEMAX 512 \
    --config GDAL_NUM_THREADS ALL_CPUS \
    -of COG \
    "${UNSCALE_ARGS[@]+"${UNSCALE_ARGS[@]}"}" \
    -co COMPRESS=ZSTD \
    -co BLOCKSIZE=512 \
    -co OVERVIEWS=AUTO \
    -co BIGTIFF=YES \
    -co NUM_THREADS=ALL_CPUS \
    -co "OVERVIEW_RESAMPLING=$RESAMPLING" >&2
  [[ -n "$SCALE" ]] && rm ./tmp.vrt
fi

echo "$OUT"
