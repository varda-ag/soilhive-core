import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';

import classnames from 'classnames';

import SmallCrossIcon from 'assets/icons/small-cross-icon.svg?react';
import { FormFieldWrapper } from 'components/UI';
import type { ComponentSizeType } from 'types/components';

import styles from './TextInput.module.scss';

type TextInputType = 'text' | 'email' | 'number';

interface Props {
  className?: string;
  inputClassName?: string;
  type?: TextInputType;
  size?: ComponentSizeType;
  name?: string;
  label?: string;
  labelTooltip?: string;
  placeholder?: string;
  value?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isClearable?: boolean;
  isError?: boolean;
  errorMessage?: string;
  helperMessage?: string;
  onClear?: (name?: string) => void;
  onChange?: (value: string, name?: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function TextInput({
  className,
  inputClassName,
  size = 'small',
  type = 'text',
  name,
  label,
  labelTooltip,
  placeholder = '',
  value = '',
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  isClearable = false,
  isError = false,
  errorMessage,
  helperMessage,
  onClear,
  onChange,
  onFocus,
  onBlur,
}: Props) {
  const [currentValue, setCurrentValue] = useState(value);
  const [isFocused, setFocused] = useState(false);

  const sizeClass = useMemo(() => {
    return {
      medium: styles.Medium,
      small: styles.Small,
      tiny: styles.Tiny,
    }[size];
  }, [size]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setCurrentValue(value);
      onChange?.(value, name);
    },
    [onChange, name],
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
    [onChange, onClear, name],
  );

  useEffect(() => {
    if (value !== currentValue) {
      setCurrentValue(value);
    }
  }, [value, currentValue]);

  return (
    <FormFieldWrapper
      className={className}
      label={label}
      labelTooltip={labelTooltip}
      size={size}
      isRequired={isRequired}
      isError={isError}
      errorMessage={errorMessage}
      helperMessage={helperMessage}
    >
      <div
        data-testid="sh-ui-textinput"
        className={classnames(
          styles.TextInput,
          sizeClass,
          { [styles.Invalid]: isError },
          { [styles.Focused]: isFocused },
          { [styles.Filled]: !!currentValue },
          { [styles.Disabled]: isDisabled },
          { [styles.ReadOnly]: isReadOnly },
          inputClassName,
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

        {isClearable && <SmallCrossIcon data-testid="sh-ui-cleartexticon" className={styles.ClearTextIcon} onClick={clearInput} />}
      </div>
    </FormFieldWrapper>
  );
}
