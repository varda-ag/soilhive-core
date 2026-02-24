import { useState, useMemo, type ChangeEvent } from 'react';
import { Accordion, SelectionPills } from 'components/UI';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import type { Selection } from 'types/components';
import styles from './RasterFilter.module.scss';

interface RasterFilterProps {
  category: {
    id: string;
    name: string;
    mapping: Record<string, number>;
    enabled: boolean;
  };
  selectedValues: number[];
  onChange: (selected: number[]) => void;
}

export function RasterFilter({ category, selectedValues, onChange }: RasterFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const options = useMemo(() => {
    return Object.entries(category.mapping)
      .map(([label, value]) => ({ label, value }))
      .filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [category.mapping, searchTerm]);

  const pillSelections = useMemo((): Selection[] => {
    return Object.entries(category.mapping)
      .filter(([_, value]) => selectedValues.includes(value))
      .map(([label, value]) => ({
        id: value.toString(),
        label: label,
      }));
  }, [category.mapping, selectedValues]);

  const handleCheckboxChange = (value: number, checked: boolean) => {
    const nextValues = checked ? [...selectedValues, value] : selectedValues.filter(v => v !== value);
    onChange(nextValues);
  };

  const handleRemovePill = (id: string) => {
    onChange(selectedValues.filter(v => v !== parseInt(id, 10)));
  };

  // If category is disabled, don't show the panel
  if (!category.enabled) {
    return null;
  }

  return (
    <Accordion
      title={category.name}
      type="secondary"
      pillsSlot={pillSelections.length > 0 && <SelectionPills selections={pillSelections} onRemove={handleRemovePill} />}
    >
      <div className={styles.Content}>
        <input
          type="text"
          placeholder={`Search ${category.name.toLowerCase()}`}
          value={searchTerm}
          onChange={handleSearch}
          className={styles.SearchInput}
        />

        <div className={styles.CheckboxList}>
          {options.map(option => (
            <Checkbox
              key={option.value}
              label={option.label}
              size="small"
              value={selectedValues.includes(option.value)}
              onChange={(checked: boolean) => handleCheckboxChange(option.value, checked)}
            />
          ))}
        </div>
      </div>
    </Accordion>
  );
}
