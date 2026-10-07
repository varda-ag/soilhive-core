export interface Cursor {
  id: string;
  column?: string;
  value?: string;
  // Present only on a raster row's cursor (GET /soil-data, docs/adr/0045): the pixel the row was
  // read from. A cursor without it is a vector row's, so cursors issued before raster rows existed
  // keep working unchanged.
  raster?: RasterCursor;
}

export interface RasterCursor {
  layer: string; // raster_layers.id
  row: number;
  col: number;
}
