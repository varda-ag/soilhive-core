import { useState } from 'react';
import { Checkbox } from 'components/UI';

interface Props {
  recordId: number;
  isInitiallyChecked: boolean;
  toggleDeletion: (id: number) => void;
}

export function DeleteCheckboxCell({ recordId, isInitiallyChecked, toggleDeletion }: Props) {
  const [checked, setChecked] = useState(isInitiallyChecked);
  return (
    <Checkbox
      value={checked}
      onChange={value => {
        setChecked(value);
        toggleDeletion(recordId);
      }}
    />
  );
}
