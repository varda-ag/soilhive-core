import { useState } from 'react';
import { Accordion, SelectionPills } from 'components/UI';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import styles from './RasterFilter.module.scss';
import { useRasterFilters } from 'hooks/useRasterFilters';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import useAvailability from 'hooks/useAvailability';

interface RasterFilterProps {
  categoryId: string;
}

export function RasterFilter({ categoryId }: RasterFilterProps) {
  const { isLoading: isLoadingDatasets } = useAvailability();
  const { category, availableOptions, isLoadingRasterCategories, selectedValues, pillSelections, handleOnChange, handlePillRemove } =
    useRasterFilters(categoryId);
  const [searchTerm, setSearchTerm] = useState('');

  if (!category?.enabled) return null;

  const filtered = availableOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const hasNoOptions = !isLoadingRasterCategories && availableOptions.length === 0;

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
        {isLoadingDatasets ? (
          <Skeleton height={120} />
        ) : hasNoOptions ? (
          <p className={styles.EmptyMessage}>For the current geometry no raster filter is available</p>
        ) : (
          <>
            <input
              type="text"
              placeholder={`Search ${category.name.toLowerCase()}`}
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
