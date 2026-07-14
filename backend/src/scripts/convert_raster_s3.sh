#!/bin/sh
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
# Dependencies: gdal_translate, gdalinfo, gdal_edit.py

set -eu

OUT=""
OUT_EXPLICIT="false"
OUTDIR=""
RESAMPLING="AVERAGE"
INPUT=""
SCALE=""

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out)             OUT="$2"; OUT_EXPLICIT="true"; shift 2 ;;
    --resampling)         RESAMPLING="$2"; shift 2 ;;
    --conversion_factor)  SCALE="$2"; shift 2 ;;
    -h|--help)            usage ;;
    -*)                   echo "Unknown option: $1" >&2; exit 1 ;;
    *)                    INPUT="$1"; shift ;;
  esac
done

[ -z "$INPUT" ] && { echo "Error: input file required" >&2; exit 1; }
# [ ! -f "$INPUT" ] && { echo "Error: file not found: $INPUT" >&2; exit 1; }

for cmd in gdal_translate gdalinfo gdal_edit.py; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd not found in PATH" >&2; exit 1; }
done

[ -z "$OUT" ] && OUT="$(basename "${INPUT%.tif}")_cog.tif"

TRANSLATE_SRC="$INPUT"
UNSCALE_FLAGS=""

if [ -n "$SCALE" ]; then
  echo "-> Applying conversion factor $SCALE" >&2
  GDAL_CACHEMAX=512 gdal_translate -of VRT "$INPUT" ./tmp.vrt
  GDAL_CACHEMAX=512 gdal_edit.py -scale "$SCALE" -offset 0 ./tmp.vrt
  TRANSLATE_SRC="./tmp.vrt"
  UNSCALE_FLAGS="-unscale -ot Float32"
fi

IS_COG=""
INFO=$(gdalinfo "$INPUT" 2>/dev/null || true)
if echo "$INFO" | grep -q "LAYOUT=COG"; then
  IS_COG="COG"
else
  BLOCK=$(echo "$INFO" | sed -n 's/.*Block=\([0-9]*x[0-9]*\).*/\1/p' | head -1)
  if [ -n "$BLOCK" ] && echo "$INFO" | grep -q "Overviews:"; then
    BLOCK_X=$(echo "$BLOCK" | cut -d'x' -f1)
    BLOCK_Y=$(echo "$BLOCK" | cut -d'x' -f2)
    if [ "${BLOCK_X:-0}" -ge 256 ] && [ "${BLOCK_Y:-0}" -ge 256 ]; then
      IS_COG="COG"
    fi
  fi
fi


if [ "$IS_COG" = "COG" ] && [ -z "$SCALE" ] && [ "$OUT_EXPLICIT" != "true" ]; then
  echo "-> Skipping COG conversion: input is already COG" >&2
  OUT="$INPUT"
elif [ "$IS_COG" = "COG" ] && [ -z "$SCALE" ]; then
  echo "-> Input is already COG and no conversion is needed, using input as output: $INPUT" >&2
  OUT="$INPUT"
else
  echo "-> Converting to COG: $OUT" >&2
  export CPL_VSIL_USE_TEMP_FILE_FOR_RANDOM_WRITE=YES
  # SC2086: intentional word-splitting for optional -unscale/-ot flags
  # shellcheck disable=SC2086
  gdal_translate "$TRANSLATE_SRC" "$OUT" \
    --config GDAL_CACHEMAX 512 \
    --config GDAL_NUM_THREADS ALL_CPUS \
    -of COG \
    $UNSCALE_FLAGS \
    -co COMPRESS=ZSTD \
    -co BLOCKSIZE=512 \
    -co OVERVIEWS=AUTO \
    -co BIGTIFF=YES \
    -co NUM_THREADS=ALL_CPUS \
    -co "OVERVIEW_RESAMPLING=$RESAMPLING" >&2
  [ -n "$SCALE" ] && rm ./tmp.vrt
fi

echo "$OUT"
