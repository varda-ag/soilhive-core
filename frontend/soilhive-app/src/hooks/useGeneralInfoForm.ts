import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ADMIN_PATHS } from '../configuration/admin';
import type { Dataset, GeneralInfoFormData } from 'types/backend';
import { useDataset } from './useDatasets';
import { useCreateDatasetMutation } from './useCreateDatasetMutation';
import { useUpdateDatasetMutation } from './useUpdateDatasetMutation';
import { useCreateMappingsMutation } from './useCreateMappingsMutation';
import { useCreateDatasetFileMapping } from './useCreateDatasetFileMapping';

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
  const [formData, setFormData] = useState<GeneralInfoFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: dataset, isLoading } = useDataset(id);
  const { mutateAsync: createDataset, isPending: isCreating } = useCreateDatasetMutation();
  const { mutateAsync: updateDataset, isPending: isUpdating } = useUpdateDatasetMutation(id ?? '');
  const { mutateAsync: createMappings, isPending: isCreatingMappings } = useCreateMappingsMutation();
  const { mutateAsync: createDatasetFileMapping, isPending: isCreatingDatasetFileMapping } = useCreateDatasetFileMapping();

  function validate(data: GeneralInfoFormData): ValidationErrors {
    const errors: ValidationErrors = {};
    if (!data.name.trim()) errors.name = validationMessages.name;
    if (!data.full_name.trim()) errors.full_name = validationMessages.full_name;
    if (!data.description.trim()) errors.description = validationMessages.description;
    if (!data.author.trim()) errors.author = validationMessages.author;
    return errors;
  }

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

    try {
      if (id) {
        return await updateDataset(formData);
      } else {
        const savedDataset = await createDataset(formData);
        const savedMappings = await createMappings({});
        await createDatasetFileMapping({ datasetId: savedDataset.id, fileID: undefined, mappingId: savedMappings.id });

        return savedDataset;
      }
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
    isSaving: isCreating || isUpdating || isCreatingMappings || isCreatingDatasetFileMapping,
    descriptionMaxLength: DESCRIPTION_MAX_LENGTH,
    handleChange,
    handleSaveAndContinueLater,
    handleContinue,
  };
}
