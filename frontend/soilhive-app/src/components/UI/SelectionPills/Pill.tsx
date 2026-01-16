import CloseIcon from 'assets/icons/small-cross-icon.svg?react';
import styles from './Pill.module.scss';
import type { Selection } from 'types/components';

interface PillProps {
  selection: Selection;
  onRemove: (id: string) => void;
}

export function Pill({ selection, onRemove }: PillProps) {
  const handleRemove = () => {
    onRemove(selection.id);
  };

  return (
    <div className={styles.Pill}>
      <span className={styles.Label}>{selection.label}</span>
      <button type="button" className={styles.RemoveButton} onClick={handleRemove} aria-label={`Remove ${selection.label}`}>
        <CloseIcon />
      </button>
    </div>
  );
}
