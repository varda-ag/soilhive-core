import { type ChangeEvent } from 'react';

import styles from './MultiselectButton.module.scss';
import classnames from 'classnames';

interface Props {
  id: string;
  label: string;
  selected: boolean;
  className?: string;
  onChange: (selected: boolean, id: string) => void;
}

export function MultiselectButton({ id, label, selected, className, onChange }: Props) {
  return (
    <label data-testid="sh-ui-multiselect-button" className={classnames(styles.MultiselectButton, className)}>
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
