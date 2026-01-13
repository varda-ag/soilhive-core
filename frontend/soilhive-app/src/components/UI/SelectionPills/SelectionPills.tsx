import { Pill } from './Pill';
import type { Selection } from 'types/components';
import styles from './SelectionPills.module.scss';

interface SelectionPillsProps {
  selections: Selection[];
  onRemove: (id: string) => void;
}

export function SelectionPills({ selections, onRemove }: SelectionPillsProps) {
  if (selections.length === 0) {
    return null;
  }

  return (
    <div className={styles.SelectionPills}>
      {selections.map(selection => (
        <Pill key={selection.id} selection={selection} onRemove={onRemove} />
      ))}
    </div>
  );
}
