import { useCallback } from 'react';
import type { Selection } from 'types/components';

import styles from './MultiselectButtons.module.scss';
import { MultiselectButton } from './MultiselectButton/MultiselectButton';

interface Props {
  items: Selection[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function MultiselectButtons({ items, selected, onChange }: Props) {
  const handleChange = useCallback(
    (isSelected: boolean, selectedId: string) => {
      const newSelected = isSelected ? [...selected, selectedId] : selected.filter(id => id !== selectedId);

      onChange(newSelected);
    },
    [selected, onChange],
  );

  return (
    <div data-testid="sh-ui-multiselect-buttons" className={styles.MultiselectButtons}>
      {items.map(({ id, label }) => (
        <MultiselectButton key={id} id={id} label={label} selected={selected.includes(id)} onChange={handleChange} />
      ))}
    </div>
  );
}
