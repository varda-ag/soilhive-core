import { useCallback } from 'react';
import classnames from 'classnames';

import styles from './ThemeColorField.module.scss';
import { ColorPicker, TextInput } from 'components/UI';

interface Props {
  initialValue?: string;
  label: string;
  name: string;
  className?: string;
  onChange: (name: string, value: string) => void;
}

export function ThemeColorField({ initialValue = '', label, name, className, onChange }: Props) {
  const handleChange = useCallback(
    (value: string) => {
      onChange(name, value);
    },
    [onChange, name],
  );

  return (
    <div data-testid="sh-theme-color-field" className={classnames(styles.ThemeColorField, className)}>
      <ColorPicker initialValue={initialValue} name={name} onChange={handleChange} />
      <TextInput label={label} labelTooltip="Tooltip" size="tiny" value={initialValue} onChange={handleChange} />
    </div>
  );
}
