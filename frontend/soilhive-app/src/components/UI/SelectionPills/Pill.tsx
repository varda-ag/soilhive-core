import classnames from 'classnames';
import CloseIcon from 'assets/icons/small-cross-icon.svg?react';
import WarningIcon from 'assets/icons/warning-icon.svg?react';
import type { Selection } from 'types/components';

import styles from './Pill.module.scss';

interface PillProps {
  selection: Selection;
  onRemove: (id: string) => void;
}

export function Pill({ selection, onRemove }: PillProps) {
  const handleRemove = () => {
    onRemove(selection.id);
  };

  return (
    <div className={classnames(styles.Pill, { [styles.Disabled]: selection.disabled })}>
      <span className={styles.Label}>{selection.label}</span>
      <button type="button" className={styles.RemoveButton} onClick={handleRemove} aria-label={`Remove ${selection.label}`}>
        {selection.disabled && <WarningIcon />}
        <CloseIcon />
      </button>
    </div>
  );
}
