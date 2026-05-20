export interface DataAvailabilityIndex {
  resolution: number;
  min: number;
  max: number;
  cells: Record<string, number>;
}
