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

### Raster filters

Raster filters are no longer installed from the command line: see [Map-Based Filters](../map-based-filters.md) and `docs/adr/0067`.
