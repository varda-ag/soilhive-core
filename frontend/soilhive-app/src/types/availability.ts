export type DatasetProperties = {
  points: number;
  layers: number;
  minDepth?: number;
  maxDepth?: number;
  dateStart?: number;
  dateEnd?: number;
};

export type AvailabilityDataset = {
  id: string;
  name: string;
  views: string;
  tags: string[];
  properties: DatasetProperties;
};

export type DatasetSummary = {
  count: number;
  dataPoints: number;
  layers: number;
  depth: string;
  date: string;
};

export type TimeFilterState = {
  min?: number;
  max?: number;
};
