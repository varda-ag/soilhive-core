import { useCallback } from 'react';
import classnames from 'classnames';
import { Tooltip } from 'react-tooltip';

import TooltipIcon from 'assets/icons/small-info-icon.svg?react';
import { ColorPicker, TextInput } from 'components/UI';

import styles from './ColorsSettingsField.module.scss';

interface Props {
  initialValue?: string;
  label: string;
  name: string;
  tooltipLabel?: string;
  tooltipText?: string;
  className?: string;
  onChange: (name: string, value: string) => void;
}

export function ColorsSettingsField({ initialValue = '', label, name, tooltipLabel, tooltipText, className, onChange }: Props) {
  const handleChange = useCallback(
    (value: string) => {
      onChange(name, value);
    },
    [onChange, name],
  );

  return (
    <div data-testid="sh-colors-settings-field" className={classnames(styles.ColorsSettingsField, className)}>
      {!!tooltipLabel && (
        <div className={styles.TooltipLabel}>
          {tooltipLabel}
          {!!tooltipText && (
            <>
              <TooltipIcon className={styles.Icon} data-tooltip-id="label-tooltip" data-tooltip-content={tooltipText} />
              <Tooltip id="label-tooltip" />
            </>
          )}
        </div>
      )}
      <div className={classnames(styles.InputsWrapper, className)}>
        <ColorPicker initialValue={initialValue} name={name} onChange={handleChange} />
        <TextInput label={label} size="tiny" value={initialValue} onChange={handleChange} />
      </div>
    </div>
  );
}
