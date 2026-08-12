import { renderHook } from '@testing-library/react';
import { useProcedureByColumn } from 'hooks/useProcedureByColumn';
import { useApiQueries } from 'hooks/useApiQueries';

jest.mock('hooks/useApiQueries', () => ({
  useApiQueries: jest.fn(),
}));

const mockUseApiQueries = useApiQueries as jest.Mock;

describe('useProcedureByColumn', () => {
  it('returns an empty map and isLoadingProcedures=false when there are no procedures to fetch', () => {
    mockUseApiQueries.mockReturnValue([]);
    const { result } = renderHook(() => useProcedureByColumn([]));
    expect(result.current.procedureByColumn).toEqual({});
    expect(result.current.isLoadingProcedures).toBe(false);
  });

  it('builds procedureByColumn keyed by columnName from the queries, in order', () => {
    mockUseApiQueries.mockReturnValue([
      { data: { id: 'proc-1', laboratory_method: 'method-a' }, isLoading: false },
      { data: { id: 'proc-2', laboratory_method: 'method-b' }, isLoading: false },
    ]);
    const { result } = renderHook(() =>
      useProcedureByColumn([
        { columnName: 'col1', procedureId: 'proc-1' },
        { columnName: 'col2', procedureId: 'proc-2' },
      ]),
    );
    expect(result.current.procedureByColumn.col1).toEqual({ id: 'proc-1', laboratory_method: 'method-a' });
    expect(result.current.procedureByColumn.col2).toEqual({ id: 'proc-2', laboratory_method: 'method-b' });
  });

  it('omits a column from the map when its query has not resolved data yet', () => {
    mockUseApiQueries.mockReturnValue([{ data: undefined, isLoading: true }]);
    const { result } = renderHook(() => useProcedureByColumn([{ columnName: 'col1', procedureId: 'proc-1' }]));
    expect(result.current.procedureByColumn).toEqual({});
  });

  it('is loading when there are procedures to fetch and at least one query is still loading', () => {
    mockUseApiQueries.mockReturnValue([{ data: undefined, isLoading: true }]);
    const { result } = renderHook(() => useProcedureByColumn([{ columnName: 'col1', procedureId: 'proc-1' }]));
    expect(result.current.isLoadingProcedures).toBe(true);
  });

  it('is not loading once all queries have resolved', () => {
    mockUseApiQueries.mockReturnValue([{ data: { id: 'proc-1' }, isLoading: false }]);
    const { result } = renderHook(() => useProcedureByColumn([{ columnName: 'col1', procedureId: 'proc-1' }]));
    expect(result.current.isLoadingProcedures).toBe(false);
  });

  it('passes one query per procedure, keyed by /procedures/{id}', () => {
    mockUseApiQueries.mockReturnValue([]);
    renderHook(() => useProcedureByColumn([{ columnName: 'col1', procedureId: 'proc-1' }]));
    expect(mockUseApiQueries).toHaveBeenCalledWith([
      expect.objectContaining({ endpoint: '/procedures/proc-1', method: 'GET', queryKey: ['procedures', 'proc-1'], enabled: true }),
    ]);
  });
});
