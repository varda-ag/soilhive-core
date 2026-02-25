export interface RasterFilter {
  id: string;
  name: string;
  description: string;
  mappings: Map<string, number> | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface RasterFilterWithEnabled extends RasterFilter {
  enabled: boolean;
}
