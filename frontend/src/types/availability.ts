export type DatasetProperties = {
  points?: number;
  layers?: number;
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
  dataType?: string;
  visibility?: string;
  properties: DatasetProperties;
};

export type DatasetSummary = {
  count: number;
  dataPoints: number;
  layers: number;
  depth: string;
  date: string;
  globalDateStart: string | null;
  globalDateEnd: string | null;
  globalMinDepth: number | null;
  globalMaxDepth: number | null;
};

export type TimeFilterState = {
  min?: number;
  max?: number;
};

export type DatasetFrontendFilters = {
  type: string[];
  visibility: string[];
};
