#!/usr/bin/env bash
# ingest_raster.sh — Convert a GeoTIFF to COG and register its spatial metadata
# in the raster_layers catalog table (schema defined in raster_sh_v1.md).
#
# Usage:
#   ./scripts/ingest_raster.sh [OPTIONS] <input.tif>
#
# Required:
#   -r, --resolution  Resolution in metres (e.g. 10, 100, 250, 1000)
#   -e, --extent      Extent type: global | continental | national | regional
#
# Optional:
#   -o, --out         Output COG path (default: <input>_cog.tif)
#   -n, --nodata      NoData value (auto-detected from file if omitted)
#   -d, --dsn         PostgreSQL connection string (default: $DATABASE_URL)
#   -s, --schema      PostgreSQL schema (default: public)
#   -D, --dataset     Dataset name (default: "test-ds")
#   -P, --soil-property     Soil property name (default: "Organic Carbon Stock")
#       --resampling  GDAL overview resampling: AVERAGE (default) | NEAREST
#   -h, --help        Show this help
#
# Dependencies: gdal_translate, gdalinfo, gdal_footprint, gdalsrsinfo, jq, psql

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────

RESOLUTION=""
EXTENT=""
OUT=""
NODATA=""
DSN="${DATABASE_URL:-}"
SCHEMA="${POSTGRES_SCHEMA:-public}"
RESAMPLING="AVERAGE"
INPUT=""
DATASET="test-ds"
SOILPROP="Organic Carbon Stock"

# ─── Argument parsing ─────────────────────────────────────────────────────────

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--resolution)  RESOLUTION="$2"; shift 2 ;;
    -e|--extent)      EXTENT="$2";     shift 2 ;;
    -o|--out)         OUT="$2";        shift 2 ;;
    -n|--nodata)      NODATA="$2";     shift 2 ;;
    -d|--dsn)         DSN="$2";        shift 2 ;;
    -s|--schema)      SCHEMA="$2";     shift 2 ;;
    -D|--dataset)     DATASET="$2";     shift 2 ;;
    -P|--soil-property)     SOILPROP="$2";     shift 2 ;;
    --resampling)     RESAMPLING="$2"; shift 2 ;;
    -h|--help)        usage ;;
    -*)               echo "Unknown option: $1" >&2; exit 1 ;;
    *)                INPUT="$1";      shift ;;
  esac
done

[[ -z "$INPUT" ]]      && { echo "Error: input file required" >&2; exit 1; }
[[ -z "$RESOLUTION" ]] && { echo "Error: --resolution required" >&2; exit 1; }
[[ -z "$EXTENT" ]]     && { echo "Error: --extent required" >&2; exit 1; }
[[ -z "$DSN" ]]        && { echo "Error: --dsn or DATABASE_URL required" >&2; exit 1; }
[[ ! -f "$INPUT" ]]    && { echo "Error: file not found: $INPUT" >&2; exit 1; }

for cmd in gdal_translate gdalinfo gdal_footprint gdalsrsinfo jq psql; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd not found in PATH" >&2; exit 1; }
done

case "$EXTENT" in
  global|continental|national|regional) ;;
  *) echo "Error: --extent must be one of: global continental national regional" >&2; exit 1 ;;
esac

[[ -z "$OUT" ]] && OUT="${INPUT%.tif}_cog.tif"

TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT

# ─── Step 1: COG conversion ───────────────────────────────────────────────────

echo "-> [1/4] Converting to COG: $OUT"

gdal_translate "$INPUT" "$OUT" \
  -of COG \
  -co COMPRESS=DEFLATE \
  -co BLOCKSIZE=512 \
  -co OVERVIEWS=AUTO \
  -co BIGTIFF=IF_NEEDED \
  -co "OVERVIEW_RESAMPLING=$RESAMPLING"

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

# SRS WKT (single-line, single-quotes escaped for SQL)
SRS_WKT=$(gdalsrsinfo -o wkt "$OUT" 2>/dev/null | tr -d '\n' || true)
SRS_WKT_ESC="${SRS_WKT//\'/\'\'}"

echo "  nodata=${NODATA:-<none>}  overviews=$OVR_COUNT"

# ─── Step 3: Footprint extraction ─────────────────────────────────────────────

echo "-> [3/4] Extracting footprint"

FP_RAW="$TMPDIR_WORK/footprint_raw.geojson"
FP_FLAGS="-b 1 -max_points 5000"
if [[ "$OVR_COUNT" -gt 0 ]]; then
  OVR_LEVEL=$(( OVR_COUNT - 1 < 4 ? OVR_COUNT - 1 : 4 ))
  FP_FLAGS="$FP_FLAGS -ovr $OVR_LEVEL"
  echo "  using overview level $OVR_LEVEL"
elif [[ -n "$NODATA" ]]; then
  FP_FLAGS="$FP_FLAGS -srcnodata $NODATA"
  echo "  no overviews — using srcnodata $NODATA"
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
    CASE $RESOLUTION
      WHEN 10   THEN 0.002
      WHEN 100  THEN 0.008
      WHEN 250  THEN 0.02
      WHEN 1000 THEN 0.05
      ELSE           0.01
    END *
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
-- Geohash precision-5 cells enumerated from the raw footprint bbox.
-- lat_step = 180 / 2^12 = lon_step = 360 / 2^13 (both ~0.043945 deg).
-- Uses integer cell indices to avoid floating-point drift in generate_series.
geohash AS (
  SELECT
    CASE WHEN $RESOLUTION <= 10 AND '$EXTENT' = 'global' THEN (
      SELECT array_agg(DISTINCT ST_GeoHash(
        ST_SetSRID(ST_Point(
          LEAST(-180.0 + (i_lon + 0.5) * (360.0 / 8192), 179.9999),
          LEAST( -90.0 + (i_lat + 0.5) * (180.0 / 4096),  89.9999)
        ), 4326), 5
      ))
      FROM (
        SELECT
          floor((ST_XMin(ST_Envelope(geom)) + 180.0) / (360.0 / 8192))::int AS lon0,
          ceil( (ST_XMax(ST_Envelope(geom)) + 180.0) / (360.0 / 8192))::int AS lon1,
          floor((ST_YMin(ST_Envelope(geom)) +  90.0) / (180.0 / 4096))::int AS lat0,
          ceil( (ST_YMax(ST_Envelope(geom)) +  90.0) / (180.0 / 4096))::int AS lat1
        FROM raw_fp
      ) b,
      generate_series(b.lon0, b.lon1 - 1) AS i_lon,
      generate_series(b.lat0, b.lat1 - 1) AS i_lat
    )
    ELSE NULL END AS cells
), file_ins as (
INSERT INTO files ("name", file_path, created_by)
VALUES ('$OUT', '$OUT', 'data-admin')
RETURNING *
), ds_ins AS (
INSERT INTO datasets("name", "created_by") 
VALUES ('$DATASET', 'data-admin')
ON CONFLICT ("name") WHERE (deleted_at IS NULL) DO UPDATE SET updated_at=now()
RETURNING *), sp AS (
SELECT id from soil_properties where property_name='$SOILPROP')
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
  sp.id,
  $RESOLUTION,
  '$EXTENT',
  simplified.geom,
  geohash.cells,
  $NODATA_SQL
FROM simplified, geohash, file_ins, ds_ins, sp;

SELECT rl.id, f.file_path, rl.resolution_m, rl.extent_type, rl.nodata_value
FROM   raster_layers rl
LEFT JOIN files f
ON rl.file_id=f.id
WHERE  file_path = '$OUT';
SQL

echo "Done: $OUT"
