import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ADMIN_PATHS } from '../configuration/admin';
import type { Dataset, GeneralInfoFormData } from 'types/backend';
import { useDataset } from './useDatasets';
import { useCreateDatasetMutation, useUpdateDatasetMutation } from 'hooks/useDatasetMutation';
import { queryClient } from '../App';
import { isEmptyString } from '../utilities/validation';
import useIngestionFlow from './useIngestionFlow';

const DESCRIPTION_MAX_LENGTH = 200;

const EMPTY_FORM: GeneralInfoFormData = {
  name: '',
  full_name: '',
  description: '',
  author: '',
};

type ValidationMessages = Record<keyof GeneralInfoFormData, string>;
type ValidationErrors = Partial<Record<keyof GeneralInfoFormData, string>>;

export function useGeneralInfoForm(id: string | undefined, validationMessages: ValidationMessages) {
  const navigate = useNavigate();
  const { markAsChanged, resetChanges } = useIngestionFlow();
  const [formData, setFormData] = useState<GeneralInfoFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: dataset, isLoading } = useDataset(id);
  const { mutateAsync: createDataset, isPending: isCreating } = useCreateDatasetMutation();
  const { mutateAsync: updateDataset, isPending: isUpdating } = useUpdateDatasetMutation(id ?? '');

  function validate(data: GeneralInfoFormData): ValidationErrors {
    const errors: ValidationErrors = {};
    if (isEmptyString(data.name)) errors.name = validationMessages.name;
    if (isEmptyString(data.full_name)) errors.full_name = validationMessages.full_name;
    if (isEmptyString(data.description)) errors.description = validationMessages.description;
    if (isEmptyString(data.author)) errors.author = validationMessages.author;
    return errors;
  }

  useEffect(() => {
    if (id) markAsChanged();
  }, [id, markAsChanged]);

  useEffect(() => {
    if (dataset) {
      setFormData({
        name: dataset.name ?? '',
        full_name: dataset.full_name ?? '',
        description: dataset.description ?? '',
        author: dataset.author ?? '',
      });
    }
  }, [dataset]);

  function handleChange(field: keyof GeneralInfoFormData, value: string) {
    markAsChanged();
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  async function save(): Promise<Dataset | null> {
    const validationErrors = validate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return null;
    }

    setSubmitError(null);
    resetChanges();

    try {
      let response;
      if (id) {
        response = await updateDataset(formData);
      } else {
        response = await createDataset(formData);
      }
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      return response;
    } catch {
      setSubmitError('Something went wrong. Please try again.');
      return null;
    }
  }

  async function handleSaveAndContinueLater() {
    const result = await save();
    if (result) navigate(ADMIN_PATHS.DATASETS);
  }

  async function handleContinue() {
    const result = await save();
    if (result) {
      const datasetId = id ?? result.id;
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/soil-data`);
    }
  }

  return {
    formData,
    errors,
    submitError,
    isLoading,
    isSaving: isCreating || isUpdating,
    descriptionMaxLength: DESCRIPTION_MAX_LENGTH,
    handleChange,
    handleSaveAndContinueLater,
    handleContinue,
  };
}
