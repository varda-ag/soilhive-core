import { useCallback, useState } from 'react';
import { isEmptyString } from '../utilities/validation';

export const FILTER_DESCRIPTION_MAX_LENGTH = 600;

export type FilterFormData = { name: string; description: string };

export function useFilterForm() {
  const [formData, setFormData] = useState<FilterFormData>({ name: '', description: '' });

  const handleChange = useCallback((field: keyof FilterFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Both are required by the API
  const isFormValid = !isEmptyString(formData.name) && !isEmptyString(formData.description);

  const trimmedFormData = useCallback(
    (): FilterFormData => ({ name: formData.name.trim(), description: formData.description.trim() }),
    [formData],
  );

  return { formData, setFormData, handleChange, isFormValid, trimmedFormData };
}
