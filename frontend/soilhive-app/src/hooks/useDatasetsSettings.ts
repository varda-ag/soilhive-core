import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ADMIN_PATHS } from '../configuration/admin';
import { isValidEmail } from '../utilities/validation';
import { useAuthContext } from '../auth/AuthContextProvider';
import { AuthModes } from '../auth/types';
import { useDataset } from './useDatasets';
import { useUpdateDatasetVisibilityMutation } from './useDatasetMutation';
import type { EntitlementCapability } from 'types/backend';
import { useDatasetEntitlements, useDatasetEntitlementsMutation } from './useDatasetEntitlements';

export type Visibility = 'public' | 'private';

export type AccessEmail = { email: string };

export function useDatasetsSettings(datasetId: string | undefined) {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const invalidEmailMessage = t('datasets.settings.access.email_invalid');

  const queryClient = useQueryClient();
  const { authMode } = useAuthContext();
  const isOidcAuth = authMode === AuthModes.OIDC;

  const { data: dataset, isLoading: isDatasetLoading } = useDataset(datasetId);
  const { data: entitlements, isLoading: isEntitlementsLoading } = useDatasetEntitlements(datasetId);
  const updateDataset = useUpdateDatasetVisibilityMutation(datasetId ?? '');
  const updateEntitlements = useDatasetEntitlementsMutation(datasetId ?? '');

  const [visibility, setVisibility] = useState<Visibility>('private');
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [accessEmails, setAccessEmails] = useState<AccessEmail[]>([]);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);
  const [isPublishWarningVisible, setIsPublishWarningVisible] = useState(false);

  useEffect(() => {
    if (dataset?.visibility) {
      setVisibility(dataset.visibility as Visibility);
    }
  }, [dataset?.visibility]);

  useEffect(() => {
    if (entitlements) {
      setAccessEmails(Object.keys(entitlements).map(email => ({ email })));
    }
  }, [entitlements]);

  const isLoading = isDatasetLoading || isEntitlementsLoading;
  const isSaving = updateDataset.isPending || updateEntitlements.isPending;

  function handleEmailChange(value: string) {
    setEmailInput(value);
    setEmailError('');
  }

  function handleEmailBlur() {
    if (emailInput.trim() && !isValidEmail(emailInput)) {
      setEmailError(invalidEmailMessage);
    }
  }

  function handleAddEmail() {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setEmailError(invalidEmailMessage);
      return;
    }
    if (accessEmails.some(e => e.email === trimmed)) {
      setEmailError(t('datasets.settings.access.email_duplicate'));
      return;
    }
    setAccessEmails(prev => [...prev, { email: trimmed }]);
    setEmailInput('');
    setEmailError('');
  }

  function handleRequestRemoveEmail(email: string) {
    setEmailToDelete(email);
  }

  function handleConfirmRemoveEmail() {
    if (emailToDelete) {
      setAccessEmails(prev => prev.filter(e => e.email !== emailToDelete));
    }
    setEmailToDelete(null);
  }

  function handleCancelRemoveEmail() {
    setEmailToDelete(null);
  }

  function handlePublish() {
    setIsPublishWarningVisible(true);
  }

  async function handlePublishProceed() {
    setIsPublishWarningVisible(false);
    await updateDataset.mutateAsync({ visibility });
    if (visibility === 'private') {
      const payload = Object.fromEntries(accessEmails.map(({ email }) => [email, ['preview', 'download'] as EntitlementCapability[]]));
      await updateEntitlements.mutateAsync(payload);
      await queryClient.invalidateQueries({ queryKey: ['dataset-entitlements', datasetId] });
    }
    navigate(ADMIN_PATHS.DATASETS);
  }

  function handlePublishCancel() {
    setIsPublishWarningVisible(false);
  }

  function handleCancel() {
    navigate(ADMIN_PATHS.DATASETS);
  }

  return {
    isLoading,
    isSaving,
    isOidcAuth,
    visibility,
    setVisibility,
    emailInput,
    emailError,
    accessEmails,
    emailToDelete,
    isPublishWarningVisible,
    handleEmailChange,
    handleEmailBlur,
    handleAddEmail,
    handleRequestRemoveEmail,
    handleConfirmRemoveEmail,
    handleCancelRemoveEmail,
    handlePublish,
    handlePublishProceed,
    handlePublishCancel,
    handleCancel,
  };
}
