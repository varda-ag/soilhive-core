import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ADMIN_PATHS } from '../configuration/admin';
import { isValidEmail, hasTextContent } from '../utilities/validation';
import { useAuthContext } from '../auth/AuthContextProvider';
import { AuthModes } from '../auth/types';
import { useDataset } from './useDatasets';
import { useUpdateDatasetMutation } from './useDatasetMutation';
import { IngestionStatus } from 'types/backend';
import type { Dataset, EntitlementCapability } from 'types/backend';
import { useDatasetEntitlements, useDatasetEntitlementsMutation } from './useDatasetEntitlements';
import useTheme from './useTheme';
import { dateStringToYYYYMMDD } from 'utilities/date';

export type Visibility = 'public' | 'private';

export type AccessEmail = { email: string };

export function useDatasetsSettings(datasetId: string | undefined) {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const invalidEmailMessage = t('datasets.settings.access.email_invalid');

  const queryClient = useQueryClient();
  const { themeConfig } = useTheme();
  const { authMode } = useAuthContext();
  const isOidcAuth = authMode === AuthModes.OIDC;

  const { data: dataset, isLoading: isDatasetLoading } = useDataset(datasetId);
  const { data: entitlements, isLoading: isEntitlementsLoading } = useDatasetEntitlements(datasetId);
  const updateDataset = useUpdateDatasetMutation(datasetId ?? '');
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

  type MandatoryField = string | null | undefined;
  const mandatoryFields: MandatoryField[] = [
    dataset?.name,
    dataset?.full_name,
    dataset?.author,
    dataset?.description,
    dataset?.reference_period_start,
    dataset?.reference_period_stop,
    dataset?.gis_datatype,
  ];

  if (dataset?.gis_datatype === 'raster') {
    mandatoryFields.push(dataset?.spatial_resolution);
  }

  const hasMandatoryMetadata =
    !!dataset &&
    mandatoryFields.every(v => typeof v === 'string' && v.trim().length > 0) &&
    Array.isArray(dataset.licenses) &&
    dataset.licenses.length > 0 &&
    Array.isArray(dataset.measured_properties) &&
    dataset.measured_properties.length > 0 &&
    dataset.soil_depth != null &&
    (dataset.soil_depth as { min?: number; max?: number }).min != null &&
    (dataset.soil_depth as { min?: number; max?: number }).max != null;

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

  async function handlePublish() {
    const hasLegalDocs = hasTextContent(themeConfig.privacyPolicyHtml) && hasTextContent(themeConfig.termsAndConditionsHtml);
    if (hasLegalDocs) {
      await handlePublishProceed();
    } else {
      setIsPublishWarningVisible(true);
    }
  }

  async function handlePublishProceed() {
    setIsPublishWarningVisible(false);

    const datasetUpdateData: Partial<Dataset> = {
      visibility,
      status: IngestionStatus.PUBLISHED,
    };

    if (!dataset?.publication_date) {
      datasetUpdateData.publication_date = dateStringToYYYYMMDD(new Date());
    }
    await updateDataset.mutateAsync(datasetUpdateData);
    await queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
    await queryClient.invalidateQueries({ queryKey: ['datasets'] });
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
    hasMandatoryMetadata,
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
