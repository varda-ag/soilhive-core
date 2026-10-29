import { useState } from 'react';
import { Accordion, FormMessage, SelectionPills } from 'components/UI';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import { useTranslation } from 'react-i18next';
import styles from './RasterFilter.module.scss';
import { useRasterFilters } from 'hooks/useRasterFilters';
import useDevice from 'hooks/useDevice';
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
  const { isMobileLayout } = useDevice();
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation('availability');

  if (!category?.enabled) return null;

  const filtered = availableOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));

  // An option stands for every pixel value sharing its label
  const handleCheckboxChange = (values: number[], checked: boolean) => {
    const others = selectedValues.filter(v => !values.includes(v));
    handleOnChange(checked ? [...others, ...values] : others);
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
                  key={option.label}
                  label={option.label}
                  size={isMobileLayout ? 'medium' : 'small'}
                  value={option.values.some(v => selectedValues.includes(v))}
                  onChange={(checked: boolean) => handleCheckboxChange(option.values, checked)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Accordion>
  );
}
