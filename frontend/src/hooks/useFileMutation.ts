import type { FileDescriptor } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useUpdateFileCrsMutation(id: string | null | undefined) {
  return useApiMutation<FileDescriptor | null, { epsg: number }>({
    endpoint: `/files/${id}`,
    method: 'PATCH',
    showErrorNotification: true,
  });
}
