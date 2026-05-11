import { useState } from 'react';
import { Accordion, FormMessage, SelectionPills } from 'components/UI';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import { useTranslation } from 'react-i18next';
import styles from './RasterFilter.module.scss';
import { useRasterFilters } from 'hooks/useRasterFilters';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

interface RasterFilterProps {
  categoryId: string;
}

export function RasterFilter({ categoryId }: RasterFilterProps) {
  const {
    category,
    availableOptions,
    selectedValues,
    pillSelections,
    hasNoOptions,
    isLoadingPartialFilter,
    handleOnChange,
    handlePillRemove,
  } = useRasterFilters(categoryId);
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation('availability');

  if (!category?.enabled) return null;

  const filtered = availableOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleCheckboxChange = (value: number, checked: boolean) => {
    const nextValues = checked ? [...selectedValues, value] : selectedValues.filter(v => v !== value);
    handleOnChange(nextValues);
  };

  return (
    <Accordion
      title={category.name}
      type="secondary"
      pillsSlot={pillSelections.length > 0 && <SelectionPills selections={pillSelections} onRemove={handlePillRemove} />}
    >
      <div className={styles.Content}>
        {isLoadingPartialFilter ? (
          <Skeleton height={120} />
        ) : hasNoOptions ? (
          <div data-testid="sh-unavailable-filter-message" className={styles.WarningMessage}>
            <FormMessage message={t('filter.no_filter_available', 'No filter is available')} type="warning" withBackground={true} />
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder={`${t('filter.search_placeholder')} ${category.name.toLowerCase()}`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={styles.SearchInput}
            />
            <div className={styles.CheckboxList}>
              {filtered.map(option => (
                <Checkbox
                  key={option.value}
                  label={option.label}
                  size="small"
                  value={selectedValues.includes(option.value)}
                  onChange={(checked: boolean) => handleCheckboxChange(option.value, checked)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Accordion>
  );
}
