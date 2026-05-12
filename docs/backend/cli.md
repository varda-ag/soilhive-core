# Command Line Interface

### Synthetic data creation

It can be useful to generate random data points in a given area.
Start process as the following:

```
npm run start -- --create-data <count> --bbox <minx,miny,maxx,maxy>
```

Replace `count` and `minx,miny,maxx,maxy` with desired values.
A dataset will be generated with following specs:
- `count` point features scattered inside `bbox` extents
- 10 depth layers
- 10 observations per layer
- 1 soil property

### Load raster filter

Raster filters are geographic classification layers (e.g. land cover, agroecological zones, WRB soil groups) stored as PostGIS rasters. Once loaded, they appear in the `GET /raster-filters` API and can be used to spatially filter soil observation queries.

To load a raster filter:

```
npm run start -- --load-raster-filter <file.dump>
```

Two files must be present in the same directory:

| File | Purpose |
|------|---------|
| `<file.dump>` | PostgreSQL dump of the raster table |
| `<file.mappings>` | SQL file that inserts the filter's metadata and category mappings into the `raster_filters` table |

The `.mappings` path is derived automatically by replacing the `.dump` extension.

**Sequence of operations**

1. Validate that both `<file.dump>` and `<file.mappings>` exist on disk.
2. Restore the PostgreSQL dump using `pg_restore` with `--clean --if-exists --no-owner --no-privileges`. This creates the raster table (e.g. `land_cover`) inside the `soilhive` schema.
3. If the application is configured to use a non-default schema, move the restored table into that schema.
4. Execute the `.mappings` SQL file with the schema's search path set, inserting a row into the `raster_filters` table with the filter's `id` (table name), `name`, `description`, and a JSONB `mappings` object that maps category labels to their numeric pixel values.

Once loaded, the filter is exposed via `GET /raster-filters` with an `enabled` flag that reflects whether the backing raster table exists in the database and a mappings record is present. Disabled filters are hidden from spatial queries.
