import { Navigate, useParams } from 'react-router';
import { useIngestionStatus } from 'hooks/useIngestionStatus';
import { useDataset } from 'hooks/useDatasets';
import { IngestionStatus } from 'types/backend';
import { ADMIN_PATHS } from '../../configuration/admin';

export function DatasetsEditRedirect() {
  const { id } = useParams();
  const { isLoading: isStatusLoading, getFurthestStep } = useIngestionStatus();
  const { data: dataset, isLoading: isDatasetLoading } = useDataset(id);

  if (isStatusLoading || isDatasetLoading || !id) return null;

  if (dataset?.status === IngestionStatus.PUBLISHED) {
    return <Navigate to={`${ADMIN_PATHS.DATASETS}/edit/${id}/settings`} replace />;
  }

  const furthestStep = getFurthestStep(id);
  return <Navigate to={`${ADMIN_PATHS.DATASETS}/edit/${id}/${furthestStep}`} replace />;
}
