export interface RasterFilter {
  id: string;
  name: string;
  description: string;
  mappings: Record<string, number> | null;
  active: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export interface RasterFilterWithEnabled extends RasterFilter {
  enabled: boolean;
}
