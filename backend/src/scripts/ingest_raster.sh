#!/usr/bin/env bash
# ingest_raster.sh — Convert a GeoTIFF to COG and register its spatial metadata
# in the raster_layers catalog table (schema defined in raster_sh_v1.md).
#
# Usage:
#   ./scripts/ingest_raster.sh [OPTIONS] <input.tif>
#
# Required:
#   -e, --extent      Extent type: global | continental | national | regional
#
# Optional:
#   -o, --out         Output COG filename (default: <basename(input)>_cog.tif)
#   -O, --out-dir     Root folder prepended to --out (or the default filename)
#   -n, --nodata      NoData value (auto-detected from file if omitted)
#   -d, --dsn         PostgreSQL connection string (default: $DATABASE_URL)
#   -s, --schema      PostgreSQL schema (default: public)
#   -D, --dataset     Dataset name (default: "test-ds")
#   -P, --soil-property     Soil property name (default: "Organic Carbon Stock")
#   -C, --soil-property-category     Soil property category name (default: "Chemical")
#       --resampling  GDAL overview resampling: AVERAGE (default) | NEAREST (for categorical data: soil texture, drought vulnerability, etc.)
#   -h, --help        Show this help
#
# Dependencies: gdal_translate, gdalinfo, gdal_footprint, gdalsrsinfo, jq, psql

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────

RESOLUTION=""  # inferred from file in Step 2
EXTENT=""
OUT=""
OUTDIR=""
NODATA=""
DSN="${DATABASE_URL:-}"
SCHEMA="${POSTGRES_SCHEMA:-public}"
RESAMPLING="AVERAGE"
INPUT=""
DATASET="test-ds"
SOILPROP="Organic Carbon Stock"
SOILPROPCAT="Chemical"

# ─── Argument parsing ─────────────────────────────────────────────────────────

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--extent)      EXTENT="$2";     shift 2 ;;
    -o|--out)         OUT="$2";        shift 2 ;;
    -O|--out-dir)     OUTDIR="$2";    shift 2 ;;
    -n|--nodata)      NODATA="$2";     shift 2 ;;
    -d|--dsn)         DSN="$2";        shift 2 ;;
    -s|--schema)      SCHEMA="$2";     shift 2 ;;
    -D|--dataset)     DATASET="$2";     shift 2 ;;
    -P|--soil-property)     SOILPROP="$2";     shift 2 ;;
    -C|--soil-property-category)     SOILPROPCAT="$2";     shift 2 ;;
    --resampling)     RESAMPLING="$2"; shift 2 ;;
    -h|--help)        usage ;;
    -*)               echo "Unknown option: $1" >&2; exit 1 ;;
    *)                INPUT="$1";      shift ;;
  esac
done

[[ -z "$INPUT" ]]      && { echo "Error: input file required" >&2; exit 1; }
[[ -z "$EXTENT" ]]     && { echo "Error: --extent required" >&2; exit 1; }
[[ -z "$DSN" ]]        && { echo "Error: --dsn or DATABASE_URL required" >&2; exit 1; }
[[ ! -f "$INPUT" ]]    && { echo "Error: file not found: $INPUT" >&2; exit 1; }
[[ -n "$SOILPROP" && -z "$SOILPROPCAT" ]] && { echo "Error: --soil-property-category required when --soil-property is provided" >&2; exit 1; }

for cmd in gdal_translate gdalinfo gdal_footprint gdalsrsinfo jq psql; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd not found in PATH" >&2; exit 1; }
done

case "$EXTENT" in
  global|continental|national|regional) ;;
  *) echo "Error: --extent must be one of: global continental national regional" >&2; exit 1 ;;
esac

[[ -z "$OUT" ]] && OUT="$(basename "${INPUT%.tif}")_cog.tif"
OUT_NAME="$OUT"
[[ -n "$OUTDIR" ]] && OUT="${OUTDIR%/}/$OUT"

TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT

# ─── Step 1: COG conversion ───────────────────────────────────────────────────

IS_COG=$(gdalinfo -json "$INPUT" | jq -r '.metadata[""].LAYOUT // empty' 2>/dev/null || true)

if [[ "$IS_COG" == "COG" ]]; then
  echo "-> [1/4] Skipping COG conversion: input is already COG"
  OUT="$INPUT"
  OUT_NAME="$(basename "$INPUT")"
else
  echo "-> [1/4] Converting to COG: $OUT"
  gdal_translate "$INPUT" "$OUT" \
    -of COG \
    -co COMPRESS=DEFLATE \
    -co BLOCKSIZE=512 \
    -co OVERVIEWS=AUTO \
    -co BIGTIFF=IF_NEEDED \
    -co "OVERVIEW_RESAMPLING=$RESAMPLING"
fi

# ─── Step 2: Extract metadata ─────────────────────────────────────────────────

echo "-> [2/4] Reading metadata"

INFO_JSON="$TMPDIR_WORK/info.json"
gdalinfo -json "$OUT" > "$INFO_JSON"

# Nodata — supplied value or read from band 1 via jq
if [[ -z "$NODATA" ]]; then
  NODATA=$(jq -r 'if .bands[0].noDataValue != null then (.bands[0].noDataValue | tostring) else "" end' "$INFO_JSON")
fi

# Overview count from band 1 (used to select gdal_footprint sampling strategy)
OVR_COUNT=$(jq '(.bands[0].overviews // []) | length' "$INFO_JSON")
RASTER_PIXELS=$(jq '.size[0] * .size[1]' "$INFO_JSON")

# Bounding box in WGS84 — requires file to have a valid, transformable CRS
BBOX_GEOM=$(jq -c '.wgs84Extent // empty' "$INFO_JSON") \
  || { echo "Error: could not extract WGS84 extent — file may have no CRS" >&2; exit 1; }

# SRS WKT (single-line, single-quotes escaped for SQL)
SRS_WKT=$(gdalsrsinfo -o wkt "$OUT" 2>/dev/null | tr -d '\n' || true)
SRS_WKT_ESC="${SRS_WKT//\'/\'\'}"

# Pixel size in CRS units (geoTransform[5] is y-pixel, negative by convention)
PIXEL_SIZE_CRS=$(jq '(.geoTransform[5]) | if . < 0 then -. else . end' "$INFO_JSON")

# Geographic CRS (degrees) → scale by 111320 m/°; projected (meters) → use directly
PROJ4=$(gdalsrsinfo -o proj4 "$OUT" 2>/dev/null || true)
if echo "$PROJ4" | grep -q '+proj=lon'; then
  RESOLUTION=$(awk "BEGIN {printf \"%.4f\", $PIXEL_SIZE_CRS * 111320}")
else
  RESOLUTION=$(awk "BEGIN {printf \"%.4f\", $PIXEL_SIZE_CRS}")
fi

echo "  nodata=${NODATA:-<none>}  overviews=$OVR_COUNT  pixels=$RASTER_PIXELS  resolution=${RESOLUTION}m"

# ─── Step 3: Footprint extraction ─────────────────────────────────────────────

echo "-> [3/4] Extracting footprint"

FP_RAW="$TMPDIR_WORK/footprint_raw.geojson"
FP_FLAGS="-b 1 -max_points 5000"
# Use an overview when the raster is large (>1M pixels) and one is available —
# avoids scanning the full-resolution data for footprint extraction.
if [[ "$RASTER_PIXELS" -gt 1000000 && "$OVR_COUNT" -gt 0 ]]; then
  OVR_LEVEL=$(( OVR_COUNT - 1 < 4 ? OVR_COUNT - 1 : 4 ))
  FP_FLAGS="$FP_FLAGS -ovr $OVR_LEVEL"
  echo "  raster=${RASTER_PIXELS}px — using overview level $OVR_LEVEL"
else
  [[ -n "$NODATA" ]] && FP_FLAGS="$FP_FLAGS -srcnodata $NODATA"
  echo "  raster=${RASTER_PIXELS}px — using full resolution${NODATA:+ (srcnodata=$NODATA)}"
fi

# shellcheck disable=SC2086
gdal_footprint $FP_FLAGS "$OUT" "$FP_RAW" -f GeoJSON

# Flatten FeatureCollection -> single geometry JSON for ST_GeomFromGeoJSON
FEATURE_COUNT=$(jq '.features | length' "$FP_RAW")
if [[ "$FEATURE_COUNT" -eq 1 ]]; then
  FOOTPRINT_GEOM=$(jq -c '.features[0].geometry' "$FP_RAW")
else
  FOOTPRINT_GEOM=$(jq -c '{type:"GeometryCollection",geometries:[.features[].geometry]}' "$FP_RAW")
fi

echo "  footprint features=$FEATURE_COUNT"

# ─── Step 4: Compute derived values in PostgreSQL and insert ──────────────────
#
# Simplification tolerance:  base[resolution_m] x factor[extent_type]
# Geohash precision-5 cells: lat_step = 180/4096, lon_step = 360/8192 (~0.04395 deg)
#   Grid index over raw-footprint bbox, hashed via ST_GeoHash.
#   Only computed for resolution <= 10 m AND extent = 'global'.

echo "-> [4/4] Inserting into $SCHEMA.raster_layers"

NODATA_SQL="${NODATA:-NULL}"

psql "$DSN" <<SQL
SET search_path TO "$SCHEMA", public;

WITH
tolerance AS (
  SELECT
    POWER($RESOLUTION::float, 0.7) * 0.0004 *
    CASE '$EXTENT'
      WHEN 'global'      THEN 4.0
      WHEN 'continental' THEN 2.0
      WHEN 'national'    THEN 1.0
      WHEN 'regional'    THEN 0.5
    END AS value
),
raw_fp AS (
  SELECT ST_GeomFromGeoJSON(\$fp\$${FOOTPRINT_GEOM}\$fp\$) AS geom
),
simplified AS (
  SELECT ST_Multi(
    ST_SimplifyPreserveTopology(raw_fp.geom, tolerance.value)
  ) AS geom
  FROM raw_fp, tolerance
),
-- Multi-precision geohash cells enumerated from the footprint bbox.
-- Precision levels are chosen per extent type so queries at any scale
-- (global → fine-grained) can find a match via array overlap.
-- Uses integer cell indices to avoid floating-point drift in generate_series.
--
--  Precision | lon_grid | lat_grid | cell size (approx)
--  --------- | -------- | -------- | ------------------
--      1     |     8    |     4    | 45° x 45°
--      2     |    32    |    32    | 11° x 6°
--      3     |   256    |   128    | 1.4° x 1.4°
--      4     |  1024    |  1024    | 0.35° x 0.18°
--      5     |  8192    |  4096    | 0.04° x 0.04°
geohash AS (
  WITH fp_bbox AS (
    SELECT
      ST_XMin(ST_Envelope(geom)) AS minx,
      ST_XMax(ST_Envelope(geom)) AS maxx,
      ST_YMin(ST_Envelope(geom)) AS miny,
      ST_YMax(ST_Envelope(geom)) AS maxy
    FROM simplified
  ),
  precision_grid(prec, lon_grid, lat_grid) AS (
    VALUES
      (1::int,     8::int,     4::int),
      (2,         32,         32),
      (3,        256,        128),
      (4,       1024,       1024),
      (5,       8192,       4096)
  ),
  active_prec AS (
    SELECT prec, lon_grid, lat_grid
    FROM precision_grid
    WHERE prec = ANY(CASE '$EXTENT'
      WHEN 'global'      THEN ARRAY[1, 2]
      WHEN 'continental' THEN ARRAY[1, 2, 3]
      WHEN 'national'    THEN ARRAY[2, 3, 4]
      WHEN 'regional'    THEN ARRAY[3, 4, 5]
      ELSE                    ARRAY[1, 2, 3]
    END)
  ),
  all_cells AS (
    SELECT DISTINCT ST_GeoHash(
      ST_SetSRID(ST_Point(
        LEAST(-180.0 + (i_lon + 0.5) * (360.0 / p.lon_grid), 179.9999),
        LEAST( -90.0 + (i_lat + 0.5) * (180.0 / p.lat_grid),  89.9999)
      ), 4326), p.prec
    ) AS h
    FROM active_prec p,
    fp_bbox,
    generate_series(
      floor((fp_bbox.minx + 180.0) / (360.0 / p.lon_grid))::int,
      ceil( (fp_bbox.maxx + 180.0) / (360.0 / p.lon_grid))::int - 1
    ) AS i_lon,
    generate_series(
      floor((fp_bbox.miny +  90.0) / (180.0 / p.lat_grid))::int,
      ceil( (fp_bbox.maxy +  90.0) / (180.0 / p.lat_grid))::int - 1
    ) AS i_lat
  )
  SELECT array_agg(h) AS cells FROM all_cells
), file_ins as (
INSERT INTO files ("name", file_path, created_by)
VALUES ('$OUT_NAME', '$OUT_NAME', 'data-admin')
ON CONFLICT ("file_path") DO UPDATE SET updated_at=now()
RETURNING *
), ds_ins AS (
INSERT INTO datasets("name", "created_by", "spatial_extent", "gis_datatype", "n_raster_layers")
VALUES ('$DATASET', 'data-admin', ST_SetSRID(ST_GeomFromGeoJSON(\$bbox\$${BBOX_GEOM}\$bbox\$), 4326), 'raster', 1)
ON CONFLICT ("name") WHERE (deleted_at IS NULL) DO UPDATE SET
  updated_at = now(),
  spatial_extent = COALESCE(datasets.spatial_extent, EXCLUDED.spatial_extent),
  gis_datatype = COALESCE(datasets.gis_datatype, EXCLUDED.gis_datatype),
  n_raster_layers = EXCLUDED.n_raster_layers+1
RETURNING *), spc_ins AS (
INSERT INTO soil_property_categories("category_name", "category_acronym") 
VALUES ('$SOILPROPCAT', '$SOILPROPCAT')
ON CONFLICT ("category_name") DO UPDATE SET updated_at=now()
RETURNING *), sp_ins AS (
INSERT INTO soil_properties("property_name", "property_acronym", "category_id")
SELECT '$SOILPROP', '$SOILPROP', spc_ins.id FROM spc_ins
ON CONFLICT ("property_name") DO UPDATE SET updated_at=now()
RETURNING *)
INSERT INTO raster_layers (
  file_id,
  dataset_id,
  soil_property_id,
  resolution_m,
  extent_type,
  footprint,
  geohash_cells,
  nodata_value
)
SELECT
  file_ins.id,
  ds_ins.id,
  sp_ins.id,
  $RESOLUTION,
  '$EXTENT',
  simplified.geom,
  geohash.cells,
  $NODATA_SQL
FROM simplified, geohash, file_ins, ds_ins, sp_ins;

SELECT rl.id, f.file_path, rl.resolution_m, rl.extent_type, rl.nodata_value
FROM   raster_layers rl
LEFT JOIN files f
ON rl.file_id=f.id
WHERE  file_path = '$OUT';
SQL

echo "Done: $OUT"
