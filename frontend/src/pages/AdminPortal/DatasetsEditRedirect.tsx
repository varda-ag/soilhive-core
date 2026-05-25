import { Navigate, useParams } from 'react-router';
import { useIngestionStatus } from 'hooks/useIngestionStatus';
import { ADMIN_PATHS } from '../../configuration/admin';

export function DatasetsEditRedirect() {
  const { id } = useParams();
  const { isLoading, getFurthestStep } = useIngestionStatus();

  if (isLoading || !id) return null;

  const furthestStep = getFurthestStep(id);
  return <Navigate to={`${ADMIN_PATHS.DATASETS}/edit/${id}/${furthestStep}`} replace />;
}
