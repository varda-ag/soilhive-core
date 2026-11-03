import { renderHook } from '@testing-library/react';
import { useApiMutation } from 'hooks/useApiMutation';
import { useUpdateFileCrsMutation } from 'hooks/useFileMutation';

jest.mock('hooks/useApiMutation', () => ({
  useApiMutation: jest.fn(),
}));

const useApiMutationMock = useApiMutation as jest.Mock;

describe('useFileMutation', () => {
  beforeEach(() => {
    useApiMutationMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('useUpdateFileCrsMutation', () => {
    it('calls useApiMutation with PATCH /files/:id and error notifications', () => {
      renderHook(() => useUpdateFileCrsMutation('file-1'));

      expect(useApiMutationMock).toHaveBeenCalledWith({
        endpoint: '/files/file-1',
        method: 'PATCH',
        showErrorNotification: true,
      });
    });

    it('keeps the id out of the variables, which are sent as the body', () => {
      renderHook(() => useUpdateFileCrsMutation('file-1'));

      expect(typeof useApiMutationMock.mock.calls[0][0].endpoint).toBe('string');
    });

    it('follows a new id, so it always patches the current file', () => {
      const { rerender } = renderHook(({ id }) => useUpdateFileCrsMutation(id), { initialProps: { id: 'file-1' } });

      rerender({ id: 'file-2' });

      expect(useApiMutationMock).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: '/files/file-2' }));
    });

    it('returns the mutation from useApiMutation', () => {
      const mutation = { mutateAsync: jest.fn(), isPending: true };
      useApiMutationMock.mockReturnValue(mutation);

      const { result } = renderHook(() => useUpdateFileCrsMutation('file-1'));

      expect(result.current).toBe(mutation);
    });
  });
});
