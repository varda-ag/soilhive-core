import { useState } from 'react';
import { Accordion, SelectionPills } from 'components/UI';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import type { Selection } from 'types/components';
import styles from './RasterFilter.module.scss';

interface RasterFilterProps {
  category: {
    name: string;
    enabled: boolean;
  };
  availableOptions: { label: string; value: number }[];
  selectedValues: number[];
  pillSelections: Selection[];
  onChange: (selected: number[]) => void;
  onPillRemove: (id: string) => void;
}

export function RasterFilter({ category, availableOptions, selectedValues, pillSelections, onChange, onPillRemove }: RasterFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!category.enabled) return null;

  const filtered = availableOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleCheckboxChange = (value: number, checked: boolean) => {
    const nextValues = checked ? [...selectedValues, value] : selectedValues.filter(v => v !== value);
    onChange(nextValues);
  };

  return (
    <Accordion
      title={category.name}
      type="secondary"
      pillsSlot={pillSelections.length > 0 && <SelectionPills selections={pillSelections} onRemove={onPillRemove} />}
    >
      <div className={styles.Content}>
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
      </div>
    </Accordion>
  );
}
