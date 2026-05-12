import { useCallback } from 'react';
import classnames from 'classnames';
import type { Selection } from 'types/components';
import { MultiselectButton } from './MultiselectButton/MultiselectButton';

import styles from './MultiselectButtons.module.scss';

interface Props {
  items: Selection[];
  selected: string[];
  className?: string;
  buttonClassName?: string;
  onChange: (selected: string[]) => void;
}

export function MultiselectButtons({ items, selected, className, buttonClassName, onChange }: Props) {
  const handleChange = useCallback(
    (isSelected: boolean, selectedId: string) => {
      const newSelected = isSelected ? [...selected, selectedId] : selected.filter(id => id !== selectedId);

      onChange(newSelected);
    },
    [selected, onChange],
  );

  return (
    <div data-testid="sh-ui-multiselect-buttons" className={classnames(styles.MultiselectButtons, className)}>
      {items.map(({ id, label }) => (
        <MultiselectButton
          key={id}
          className={buttonClassName}
          id={id}
          label={label}
          selected={selected.includes(id)}
          onChange={handleChange}
        />
      ))}
    </div>
  );
}
