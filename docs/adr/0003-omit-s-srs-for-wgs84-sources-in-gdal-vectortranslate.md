# ADR 0003: Omit `-s_srs` for WGS84 and unknown-CRS sources in `fileToDB`

**Status:** Accepted

## Context

`FileService.fileToDB` uses GDAL's `vectorTranslateAsync` to import CSV/XLSX files into PostgreSQL. The original code always pushed `-s_srs EPSG:4326` (defaulting via `fileMetadata.epsg ?? 4326`) alongside `-t_srs EPSG:4326`.

In production (Alpine 3.22, GDAL 3.10.3, `--shared_gdal`), this combination produces a consistent ~500 m coordinate shift for CSV files with WKT geometry columns (e.g., `POINT (10.0 45.0)` is stored as `POINT (9.994545... 45.00248...)`). The bug does not appear on macOS M1 (Homebrew GDAL 3.12.1) or in any output format other than PostgreSQL.

Investigation confirmed:

- Direct GDAL EPSG:4326 → EPSG:4326 reprojection is identity in both environments.
- `vectorTranslate` to GeoJSON produces correct coordinates in both environments.
- Only `vectorTranslate` to PostgreSQL with `-s_srs EPSG:4326` on a **null-SRS source layer** (CSV driver with `GEOM_POSSIBLE_NAMES`) produces the shift on GDAL 3.10.3.

Root cause: GDAL 3.10.3's PostgreSQL output driver applies a spurious coordinate transformation when the source layer has a null SRS overridden by an explicit `-s_srs EPSG:4326`. This was fixed in GDAL 3.12.x but Alpine 3.22 only ships 3.10.3. Upgrading via `--shared_gdal` removal is not viable because node-gdal-async's bundled GDAL does not include the XLSX vector driver.

## Decision

Use `-a_srs EPSG:4326` (assign SRS, no reprojection) for sources with unknown or already-WGS84 CRS; use `-s_srs`/`-t_srs` only when actual reprojection is needed.

```typescript
if (fileMetadata.epsg && fileMetadata.epsg !== 4326) {
  gdalOpts.push('-s_srs', `EPSG:${fileMetadata.epsg}`);
  gdalOpts.push('-t_srs', 'EPSG:4326');
} else {
  gdalOpts.push('-a_srs', 'EPSG:4326');
}
```

`-a_srs` assigns the output SRID to 4326 without invoking GDAL's coordinate transformation pipeline at all. The previously hardcoded `-t_srs EPSG:4326` is removed from the static options array.

`-s_srs` + `-t_srs` was also considered (dropping only `-s_srs` and keeping `-t_srs`), but GDAL 3.12.x raises a SQL error when `-t_srs` is present on a null-SRS source layer without a matching `-s_srs`. `-a_srs` avoids this by not engaging the transformation pipeline on either GDAL version.

## Consequences

- CSV/XLSX files with WKT or lat/lon geometry are assumed to be in WGS84 when no CRS is declared. This matches the existing implicit assumption (`?? 4326`) and is safe — a CSV with no SRS metadata has no information from which a non-WGS84 source could be inferred.
- Files with a detected non-WGS84 EPSG (e.g., shapefiles in UTM) are unaffected: `-s_srs`/`-t_srs` reprojection works as before.
- If Alpine ships GDAL 3.12.x in a future version, `-a_srs` remains correct: assigning a redundant SRID is always a no-op.
