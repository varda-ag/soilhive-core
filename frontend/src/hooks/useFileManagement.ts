import { useCallback } from 'react';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import { useParams } from 'react-router';

export function useFileManagement() {
  const { request } = useRequest();
  const { id: datasetId } = useParams();

  const deleteFile = useCallback(
    async (id: string) => {
      await request({
        url: `${BACKEND_BASE_URL}/files/${id}`,
        method: 'DELETE',
        showErrorNotification: true,
      });
    },
    [request],
  );

  const deleteFileAndMapping = useCallback(
    async (id: string) => {
      await request({
        url: `${BACKEND_BASE_URL}/datasets/${datasetId}/dataset-file-mapping?fileId=${id}`,
        method: 'DELETE',
        showErrorNotification: true,
      });
      await deleteFile(id);
    },
    [request, datasetId, deleteFile],
  );

  return { deleteFile, deleteFileAndMapping };
}
