import { useMemo } from 'react';
import { useApiQueries } from './useApiQueries';
import type { ProcedureResponse } from 'types/backend';

// Loads procedure details for the given (columnName, procedureId) pairs and builds a lookup by
// column name, so mapping rows can pre-populate their detail fields from previously saved procedures.
export function useProcedureByColumn(proceduresInMapping: { columnName: string; procedureId: string }[]) {
  const procedureDetails = useApiQueries<ProcedureResponse>(
    proceduresInMapping.map(({ procedureId }) => ({
      endpoint: `/procedures/${procedureId}`,
      method: 'GET',
      queryKey: ['procedures', procedureId],
      enabled: true,
    })),
  );

  const isLoadingProcedures = proceduresInMapping.length > 0 && procedureDetails.some(r => r.isLoading);

  const procedureByColumn = useMemo(() => {
    const map: Record<string, ProcedureResponse> = {};
    proceduresInMapping.forEach(({ columnName }, i) => {
      const data = procedureDetails[i]?.data;
      if (data) map[columnName] = data;
    });
    return map;
    // procedureDetails is a new array every render — use isLoadingProcedures as a stable proxy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceduresInMapping, isLoadingProcedures]);

  return { procedureByColumn, isLoadingProcedures };
}
