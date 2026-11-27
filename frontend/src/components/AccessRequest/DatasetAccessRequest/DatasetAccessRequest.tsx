import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginAccessRequestCapability, PluginAccessRequestError } from 'frontend-plugin-types';

import { DownloadSignInDialog } from 'components/DownloadSignInDialog/DownloadSignInDialog';
import { useAccessRequestCreate } from 'hooks/useAccessRequestCreate';
import { useMyAccessRequests } from 'hooks/useMyAccessRequests';
import { useAuthContext } from '../../../auth/AuthContextProvider';
import { RequestAccessDialog, type RequestAccessFormValues } from '../RequestAccessDialog/RequestAccessDialog';
import { AccessRequestStatusDialog } from '../AccessRequestStatusDialog/AccessRequestStatusDialog';

// What a request from the map asks for: the Dataset's data, to explore and to download. An admin may
// approve less (ADR 0082).
export const DATASET_ACCESS_REQUEST_CAPABILITIES: PluginAccessRequestCapability[] = ['preview', 'download'];

interface Props {
  // `id` is the slug, as the map's Datasets list has it
  dataset: { id: string; name: string };
  onClose: () => void;
}

// From the "Access" button of a private Dataset on the map (SP-5991) to a sent Access Request. A
// signed-out visitor is asked to log in first: only a signed-in user can make one (ADR 0081).
export function DatasetAccessRequest({ dataset, onClose }: Props) {
  const { t } = useTranslation('availability');
  const { isAuthenticated } = useAuthContext();

  if (!isAuthenticated) {
    return <DownloadSignInDialog visible message={t('access_request.sign_in')} onClose={onClose} />;
  }
  return <SignedInDatasetAccessRequest dataset={dataset} onClose={onClose} />;
}

// The backend's own words, which name the Dataset; none for a refusal without a response
const detailOf = (error: unknown): string | undefined => {
  const body = (error as Partial<PluginAccessRequestError> | undefined)?.body as { detail?: unknown } | undefined;
  return typeof body?.detail === 'string' && body.detail !== '' ? body.detail : undefined;
};

function SignedInDatasetAccessRequest({ dataset, onClose }: Props) {
  const { t } = useTranslation('availability');
  // Read again on each opening: an admin may have decided meanwhile
  const { data: myRequests, isLoading } = useMyAccessRequests();
  const { mutateAsync: createAccessRequest, isPending: isSubmitting } = useAccessRequestCreate();
  const [status, setStatus] = useState<'sent' | 'alreadyRequested'>();
  const [sendError, setSendError] = useState<string>();

  // A Dataset in one of the user's pending requests can't be asked for again. When their requests
  // can't be read, the form shows, and the 409 of the request says it instead.
  const isAlreadyRequested = !!myRequests?.some(({ items }) =>
    items.some(item => item.status === 'pending' && item.dataset.slug === dataset.id),
  );

  // A refusal other than a 409 keeps the form open with what was typed, and the form says why
  const sendRequest = useCallback(
    async ({ name, country, organisation, organisationWebsite, reason }: RequestAccessFormValues) => {
      setSendError(undefined);
      try {
        // The email is not sent: the backend keys the request by the email of the sign-in
        await createAccessRequest({
          datasets: [dataset.id],
          capabilities: DATASET_ACCESS_REQUEST_CAPABILITIES,
          message: reason,
          requesterName: name,
          country: country as Exclude<typeof country, ''>,
          organisation,
          ...(organisationWebsite.trim() !== '' && { organisationWebsite }),
        });
        setStatus('sent');
      } catch (error) {
        if ((error as Partial<PluginAccessRequestError> | undefined)?.status === 409) {
          setStatus('alreadyRequested');
          return;
        }
        const detail = detailOf(error);
        setSendError(detail ? t('access_request.error.with_reason', { reason: detail }) : t('access_request.error.without_reason'));
      }
    },
    [createAccessRequest, dataset.id, t],
  );

  const shownStatus = status ?? (!isLoading && isAlreadyRequested ? 'alreadyRequested' : undefined);
  if (shownStatus) {
    return <AccessRequestStatusDialog status={shownStatus} datasetName={dataset.name} onClose={onClose} />;
  }
  return (
    <RequestAccessDialog
      datasetName={dataset.name}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      sendError={sendError}
      onClose={onClose}
      onSubmit={sendRequest}
    />
  );
}
