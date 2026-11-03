import { useTranslation } from 'react-i18next';

import { TextArea, TextInput } from 'components/UI';
import { FILTER_DESCRIPTION_MAX_LENGTH, type FilterFormData } from 'hooks/useFilterForm';

import styles from './FilterDescriptionForm.module.scss';

interface Props {
  formData: FilterFormData;
  onChange: (field: keyof FilterFormData, value: string) => void;
}

export function FilterDescriptionForm({ formData, onChange }: Props) {
  const { t } = useTranslation('admin');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className={styles.FilterDescriptionForm}>
      <TextInput
        className={styles.NameInput}
        label={t('createFilter.description_section.name')}
        name="name"
        placeholder={t('createFilter.description_section.name_placeholder')}
        value={formData.name}
        isRequired
        onChange={value => onChange('name', value)}
      />

      <TextArea
        textareaClassName={styles.DescriptionTextArea}
        label={t('createFilter.description_section.description')}
        name="description"
        placeholder={t('createFilter.description_section.description_placeholder')}
        value={formData.description}
        isRequired
        maxLength={FILTER_DESCRIPTION_MAX_LENGTH}
        showCounter
        symbolsText={tCommon('symbols')}
        symbolsLeftText={tCommon('symbols_left')}
        rows={6}
        onChange={value => onChange('description', value)}
      />
    </div>
  );
}
