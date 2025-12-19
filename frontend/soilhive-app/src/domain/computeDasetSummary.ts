import type { DatasetSummary } from 'types/availability';
import type { PostDatasetFilterResponse } from 'types/backend';

export default function computeDatasetSummary(fetchedFilteredResults: PostDatasetFilterResponse | undefined): DatasetSummary {
  let globalDataPoints = 0;
  const globalLayers = 0;
  let globalMinDepth: number | null = null;
  let globalMaxDepth: number | null = null;
  let globalDateStart: string | null = null;
  let globalDateEnd: string | null = null;
  let count = 0;

  if (fetchedFilteredResults && fetchedFilteredResults?.results) {
    for (const result of fetchedFilteredResults.results) {
      for (const dataset of result.datasets) {
        count++;
        globalDataPoints += dataset.dataset_layer_count;

        if (dataset.min_depth !== undefined) {
          globalMinDepth = globalMinDepth === null ? dataset.min_depth : Math.min(globalMinDepth, dataset.min_depth);
        }

        if (dataset.max_depth !== undefined) {
          globalMaxDepth = globalMaxDepth === null ? dataset.max_depth : Math.max(globalMaxDepth, dataset.max_depth);
        }

        if (dataset.min_sampling_date !== undefined) {
          if (globalDateStart === null) {
            globalDateStart = dataset.min_sampling_date;
          } else if (dataset.min_sampling_date < globalDateStart) {
            globalDateStart = dataset.min_sampling_date;
          }
        }

        if (dataset.max_sampling_date !== undefined) {
          if (globalDateEnd === null) {
            globalDateEnd = dataset.max_sampling_date;
          } else if (dataset.max_sampling_date > globalDateEnd) {
            globalDateEnd = dataset.max_sampling_date;
          }
        }
      }
    }
  }

  const depth = globalMinDepth !== null && globalMaxDepth !== null ? `${globalMinDepth}-${globalMaxDepth}` : 'N/A';
  const date = globalDateStart !== null && globalDateEnd !== null ? `${globalDateStart}-${globalDateEnd}` : 'N/A';

  return {
    count,
    dataPoints: globalDataPoints,
    layers: globalLayers,
    depth,
    date,
  };
}
