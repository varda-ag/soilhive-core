import { useMemo } from 'react';
import type { PluginQueryResult, PluginSoilIndexScore, PluginVectorTileSource } from 'frontend-plugin-types';
import { REST_END_POINTS } from 'configuration/api';
import { buildApiUrl } from 'utilities/buildApiUrl';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

// Long enough to skip the scores a pointer only crosses on its way somewhere else.
const HOVER_DEBOUNCE_MS = 100;

// The backend's TileJSON, whose tile paths are relative to the API base (docs/adr/0043).
interface SoilIndexTileJson {
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds?: [number, number, number, number];
}

export function useSoilIndexTileSource(runId: string | undefined): PluginQueryResult<PluginVectorTileSource> {
  // No token: the Run id is the whole permission, and tiles must be shareable as plain URLs.
  const { data, isLoading, isError } = useApiQuery<SoilIndexTileJson>({
    endpoint: `/${REST_END_POINTS.SOIL_INDEXES}/${runId}/tiles`,
    method: 'GET',
    queryKey: ['soil-index-tiles', runId],
    enabled: !!runId,
    authenticate: false,
    showErrorNotification: false,
  });

  return useMemo(
    () => ({
      // Resolved here because only the host knows the API base URL.
      data: data
        ? {
            type: 'vector' as const,
            tiles: data.tiles.map(path => buildApiUrl(path)),
            minzoom: data.minzoom,
            maxzoom: data.maxzoom,
            ...(data.bounds ? { bounds: data.bounds } : {}),
          }
        : undefined,
      isLoading,
      isError,
    }),
    [data, isLoading, isError],
  );
}

export function useSoilIndexScore(runId: string | undefined, scoreId: number | undefined): PluginQueryResult<PluginSoilIndexScore> {
  const { value: debouncedScoreId } = useDebounce(scoreId, HOVER_DEBOUNCE_MS);
  const { data, isLoading, isError } = useApiQuery<PluginSoilIndexScore>({
    endpoint: `/${REST_END_POINTS.SOIL_INDEXES}/${runId}/scores/${debouncedScoreId}`,
    method: 'GET',
    queryKey: ['soil-index-score', runId, debouncedScoreId],
    enabled: !!runId && debouncedScoreId !== undefined && debouncedScoreId === scoreId,
    // A score never changes.
    staleTime: Infinity,
    authenticate: false,
    showErrorNotification: false,
  });

  return useMemo(
    // Nothing for a score the pointer has already left, even while the debounce catches up.
    () => ({ data: scoreId !== undefined && data?.id === scoreId ? data : undefined, isLoading, isError }),
    [data, isLoading, isError, scoreId],
  );
}
