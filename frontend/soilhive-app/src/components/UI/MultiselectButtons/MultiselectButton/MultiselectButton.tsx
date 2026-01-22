import { type ChangeEvent } from 'react';

import styles from './MultiselectButton.module.scss';

interface Props {
  id: string;
  label: string;
  selected: boolean;
  onChange: (selected: boolean, id: string) => void;
}

export function MultiselectButton({ id, label, selected, onChange }: Props) {
  return (
    <label data-testid="sh-ui-multiselect-button" className={styles.MultiselectButton}>
      {label}
      <input
        type="checkbox"
        name={id}
        className={styles.Checkbox}
        checked={selected}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked, id)}
      />
    </label>
  );
}
