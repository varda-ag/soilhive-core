import type { SelectionPillsProps } from './SelectionPills.types';
import { Pill } from './Pill';

export function SelectionPills({ selections, onRemove }: SelectionPillsProps) {
  if (selections.length === 0) {
    return null;
  }

  return (
    <div>
      {selections.map(selection => (
        <Pill key={selection.id} selection={selection} onRemove={onRemove} />
      ))}
    </div>
  );
}
