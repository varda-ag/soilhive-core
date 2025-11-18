import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';

import classnames from 'classnames';

import SmallCrossIcon from '../../../assets/icons/small-cross-icon.svg?react';

import styles from './TextInput.module.scss';

type TextInputSize = 'medium' | 'small' | 'tiny';
type TextInputType = 'text' | 'email' | 'number';

export interface TextInputProps {
  className?: string;
  type?: TextInputType;
  size?: TextInputSize;
  name?: string;
  placeholder?: string;
  value?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isClearable?: boolean;
  isError?: boolean;
  onClear?: (name?: string) => void;
  onChange?: (value: string, name?: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function TextInput({
  className,
  size = 'medium',
  type = 'text',
  name,
  placeholder = '',
  value = '',
  isDisabled = false,
  isReadOnly = false,
  isClearable = false,
  isError = false,
  onClear,
  onChange,
  onFocus,
  onBlur,
}: TextInputProps) {
  const [currentValue, setCurrentValue] = useState(value);
  const [isFocused, setFocused] = useState(false);

  const sizeClass = useMemo(() => {
    return (
      {
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      }[size] || ''
    );
  }, [size]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setCurrentValue(value);
      onChange?.(value, name);
    },
    [onChange, name]
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onBlur?.();
  }, [onBlur]);

  const clearInput = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setCurrentValue('');
      onChange?.('', name);
      onClear?.(name);
    },
    [onChange, onClear, name]
  );

  useEffect(() => {
    if (value !== currentValue) {
      setCurrentValue(value);
    }
  }, [value]);

  return (
    <label
      data-testid="sh-ui-textinput"
      className={classnames(
        styles.TextInput,
        sizeClass,
        { [styles.Invalid]: isError },
        { [styles.Focused]: isFocused },
        { [styles.Filled]: !!currentValue },
        { [styles.Disabled]: isDisabled },
        { [styles.ReadOnly]: isReadOnly },
        className
      )}
    >

      <input
        data-testid="sh-ui-textinputfield"
        type={type}
        name={name}
        placeholder={placeholder}
        value={currentValue}
        onChange={handleChange}
        className={styles.InputField}
        disabled={isDisabled || isReadOnly}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />

      {isClearable && (
        <SmallCrossIcon
          data-testid="sh-ui-cleartexticon"
          className={styles.ClearTextIcon}
          onClick={clearInput}
        />
      )}
    </label>
  );
};

export default TextInput;
