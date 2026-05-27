import { useCallback, useRef } from 'react';
import useConfig from './useConfig';

const CONFIG_ID = 'ingestion-status';

export type IngestionStepPath = 'general-info' | 'soil-data' | 'mappings' | 'preview';

const STEP_ORDER: IngestionStepPath[] = ['general-info', 'soil-data', 'mappings', 'preview'];

type IngestionStatusConfig = Record<string, { furthestStep: IngestionStepPath }>;

export function useIngestionStatus() {
  const { config, isLoading, saveConfig } = useConfig<IngestionStatusConfig>(CONFIG_ID, {});

  const configRef = useRef(config);
  configRef.current = config;

  const getFurthestStep = useCallback(
    (slug: string): IngestionStepPath => {
      return config?.[slug]?.furthestStep ?? 'general-info';
    },
    [config],
  );

  const updateFurthestStep = useCallback(
    async (slug: string, step: IngestionStepPath): Promise<void> => {
      const current = configRef.current?.[slug]?.furthestStep;
      const currentIndex = current !== undefined ? STEP_ORDER.indexOf(current) : -1;
      const newIndex = STEP_ORDER.indexOf(step);
      if (newIndex <= currentIndex) return;
      await saveConfig({ ...configRef.current, [slug]: { furthestStep: step } });
    },
    [saveConfig],
  );

  const clearDatasetStatus = useCallback(
    async (slug: string): Promise<void> => {
      const current = configRef.current ?? {};
      if (!(slug in current)) return;
      const { [slug]: _removed, ...rest } = current;
      await saveConfig(rest);
    },
    [saveConfig],
  );

  return { isLoading, getFurthestStep, updateFurthestStep, clearDatasetStatus };
}
