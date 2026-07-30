#!/usr/bin/env bash
# convert_raster.sh — Normalize a GeoTIFF for ingestion and print the output path to stdout.
# Reprojects (optional), applies a unit conversion factor (optional), and converts to a Cloud
# Optimized GeoTIFF (COG). All other steps (metadata extraction, footprint computation, DB insert)
# are handled by the TypeScript ingest service.
#
# stdout carries ONLY the output path — it is the return value and is parsed by the caller.
# Every GDAL invocation is redirected to stderr to keep it clean.
#
# Usage:
#   ./scripts/convert_raster.sh [OPTIONS] <input.tif>
#
# Options:
#   -o, --out         Output COG filename (default: <basename(input)>_cog.tif)
#       --resampling  GDAL overview resampling: AVERAGE (default) | NEAREST
#                     Use NEAREST for categorical data (soil texture, etc.). Also selects the
#                     reprojection resampling: NEAREST -> near, AVERAGE -> bilinear.
#       --conversion_factor  Multiply pixels by a factor to convert to the standard unit of
#                     measurement. Repeat once per band, in band order, to scale bands
#                     differently: --conversion_factor 10 --conversion_factor 1 scales band 1 and
#                     leaves band 2 alone. Passing a single value for a multiband file would
#                     broadcast it to EVERY band (a gdal_edit.py behaviour), so when any band needs
#                     scaling the caller must supply a value for all of them — use 1 for no-ops.
#       --target_srs  Reproject to this CRS (e.g. EPSG:4326) before converting. The caller decides
#                     whether reprojection is needed; whenever this is passed the warp runs.
#   -h, --help        Show this help
#
# Dependencies: gdal_translate, gdalwarp, gdalinfo, gdal_edit.py, jq

set -euo pipefail

OUT=""
OUT_EXPLICIT="false"
RESAMPLING="AVERAGE"
INPUT=""
SCALES=()
TARGET_SRS=""

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--out)       OUT="$2"; OUT_EXPLICIT="true"; shift 2 ;;
    --resampling)   RESAMPLING="$2"; shift 2 ;;
    --conversion_factor)   SCALES+=("$2"); shift 2 ;;
    --target_srs)   TARGET_SRS="$2"; shift 2 ;;
    -h|--help)      usage ;;
    -*)             echo "Unknown option: $1" >&2; exit 1 ;;
    *)              INPUT="$1"; shift ;;
  esac
done

[[ -z "$INPUT" ]] && { echo "Error: input file required" >&2; exit 1; }
[[ ! -f "$INPUT" ]] && { echo "Error: file not found: $INPUT" >&2; exit 1; }

for cmd in gdal_translate gdalwarp gdalinfo gdal_edit.py jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd not found in PATH" >&2; exit 1; }
done

[[ -z "$OUT" ]] && OUT="$(basename "${INPUT%.tif}")_cog.tif"

# Intermediates sit beside the output and carry the PID: this script is invoked from a job worker,
# so two conversions can run at once and a fixed ./tmp.vrt in the working directory would collide.
TMP_PREFIX="${OUT%.tif}.$$"
CLEANUP=()
cleanup() { for f in "${CLEANUP[@]+"${CLEANUP[@]}"}"; do rm -f "$f"; done; }
trap cleanup EXIT

SRC="$INPUT"

if [[ -n "$TARGET_SRS" ]]; then
  # gdal_translate cannot reproject, so this is a separate warp pass. Categorical data must not
  # have values interpolated into existence; continuous data is smoother with bilinear.
  if [[ "$RESAMPLING" == "NEAREST" ]]; then WARP_RESAMPLING="near"; else WARP_RESAMPLING="bilinear"; fi
  echo "-> Reprojecting to $TARGET_SRS (resampling: $WARP_RESAMPLING)" >&2
  WARPED="${TMP_PREFIX}.warped.tif"
  gdalwarp \
    --config GDAL_CACHEMAX 512 \
    --config GDAL_NUM_THREADS ALL_CPUS \
    -t_srs "$TARGET_SRS" \
    -r "$WARP_RESAMPLING" \
    -of GTiff \
    -co TILED=YES \
    -co COMPRESS=DEFLATE \
    -co BIGTIFF=YES \
    "$SRC" "$WARPED" >&2
  CLEANUP+=("$WARPED")
  SRC="$WARPED"
fi

TRANSLATE_SRC="$SRC"
UNSCALE_ARGS=()

if [[ ${#SCALES[@]} -gt 0 ]]; then
  BAND_COUNT=$(gdalinfo -json "$SRC" | jq -r '.bands | length')
  # gdal_edit.py broadcasts a lone -scale across every band, so a short list would silently
  # rescale bands the caller never asked about. Demand one factor per band instead.
  if [[ ${#SCALES[@]} -ne "$BAND_COUNT" ]]; then
    echo "Error: --conversion_factor given ${#SCALES[@]} time(s) but the raster has $BAND_COUNT band(s)." >&2
    echo "       Supply one factor per band, in band order, using 1 for bands that need no scaling." >&2
    exit 1
  fi

  echo "-> Applying per-band conversion factors: ${SCALES[*]}" >&2
  VRT="${TMP_PREFIX}.vrt"
  GDAL_CACHEMAX=512 gdal_translate -of VRT "$SRC" "$VRT" >&2
  # Grouped rather than interleaved (-scale a -scale b -offset 0 -offset 0): gdal_edit.py collects
  # each option into its own list and pairs them with bands by position.
  SCALE_ARGS=()
  for factor in "${SCALES[@]}"; do SCALE_ARGS+=(-scale "$factor"); done
  for _ in "${SCALES[@]}"; do SCALE_ARGS+=(-offset 0); done
  GDAL_CACHEMAX=512 gdal_edit.py "${SCALE_ARGS[@]}" "$VRT" >&2
  CLEANUP+=("$VRT")
  TRANSLATE_SRC="$VRT"
  # -ot is dataset-wide, so scaling any band promotes them all to Float32.
  UNSCALE_ARGS=(-unscale -ot Float32)
fi

IS_COG=$(gdalinfo -json "$INPUT" 2>/dev/null | jq -r '
  if .metadata[""].LAYOUT == "COG" then "COG"
  elif ((.bands[0].block // [0,0])[0] >= 256) and ((.bands[0].block // [0,0])[1] >= 256) and ((.bands[0].overviews // []) | length > 0) then "COG"
  else "" end
' 2>/dev/null || true)

if [[ "$IS_COG" == "COG" && ${#SCALES[@]} -eq 0 && -z "$TARGET_SRS" && "$OUT_EXPLICIT" != "true" ]]; then
  echo "-> Skipping COG conversion: input is already COG" >&2
  OUT="$INPUT"
elif [[ "$IS_COG" == "COG" && ${#SCALES[@]} -eq 0 && -z "$TARGET_SRS" ]]; then
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
fi

echo "$OUT"
