import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEmptyString } from '../utilities/validation';
import { RasterFilterInstallStatus, type RasterFilter } from 'types/backend';

export type FilterMappingRow = { pixelValue: string; label: string };

// Rows are the installed raster's pixel values: labels can be edited or cleared, but no rows added or removed.
// Saved labels are shown when there are any, and otherwise the ones the raster carried
export function useFilterMappings(filter: RasterFilter | undefined) {
  const [rows, setRows] = useState<FilterMappingRow[]>([]);
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!filter || filter.install?.status !== RasterFilterInstallStatus.INSTALLED || initializedFor.current === filter.id) return;
    initializedFor.current = filter.id;
    const labels = filter.mappings && Object.keys(filter.mappings).length > 0 ? filter.mappings : filter.suggested_mappings;
    // Filters installed from the command line have no pixel_values: their labelled values are all there is
    const pixelValues = Object.keys(filter.pixel_values ?? filter.mappings ?? {});
    setRows(pixelValues.sort((a, b) => Number(a) - Number(b)).map(pixelValue => ({ pixelValue, label: labels?.[pixelValue] ?? '' })));
  }, [filter]);

  const handleLabelChange = useCallback((pixelValue: string, label: string) => {
    setRows(prev => prev.map(row => (row.pixelValue === pixelValue ? { ...row, label } : row)));
  }, []);

  const clearLabel = useCallback((pixelValue: string) => handleLabelChange(pixelValue, ''), [handleLabelChange]);

  // Values left unlabelled are never offered, so they are left out rather than sent empty
  const mappings = useMemo(
    () => Object.fromEntries(rows.filter(row => !isEmptyString(row.label)).map(row => [row.pixelValue, row.label.trim()])),
    [rows],
  );

  return { rows, mappings, handleLabelChange, clearLabel };
}
