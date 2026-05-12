import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import classnames from 'classnames';
import { FormFieldWrapper } from 'components/UI';
import type { ComponentSizeType } from 'types/components';
import styles from './TextArea.module.scss';
import { useTranslation } from 'react-i18next';

interface Props {
  className?: string;
  textareaClassName?: string;
  size?: ComponentSizeType;
  name?: string;
  label?: string;
  labelTooltip?: string;
  placeholder?: string;
  value?: string;
  rows?: number;
  maxLength?: number;
  isRequired?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isError?: boolean;
  errorMessage?: string;
  helperMessage?: string;
  showCounter?: boolean;
  onChange?: (value: string, name?: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function TextArea({
  className,
  textareaClassName,
  size = 'small',
  name,
  label,
  labelTooltip,
  placeholder = '',
  value = '',
  rows = 4,
  maxLength,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  isError = false,
  errorMessage,
  helperMessage,
  showCounter = false,
  onChange,
  onFocus,
  onBlur,
}: Props) {
  const { t } = useTranslation('common');
  const [currentValue, setCurrentValue] = useState(value);
  const [isFocused, setFocused] = useState(false);

  useEffect(() => {
    if (value !== currentValue) setCurrentValue(value);
  }, [value, currentValue]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
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

  const counterLabel = maxLength ? `${maxLength - currentValue.length} ${t('symbols_left')}` : `${currentValue.length} ${t('symbols')}`;

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
        data-testid="sh-ui-textarea"
        className={classnames(
          styles.TextArea,
          { [styles.Invalid]: isError },
          { [styles.Focused]: isFocused },
          { [styles.Disabled]: isDisabled },
          { [styles.ReadOnly]: isReadOnly },
          textareaClassName,
        )}
      >
        <textarea
          data-testid="sh-ui-textareafield"
          name={name}
          placeholder={placeholder}
          value={currentValue}
          rows={rows}
          maxLength={maxLength}
          disabled={isDisabled || isReadOnly}
          className={styles.TextAreaField}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>
      {showCounter && (
        <span data-testid="sh-ui-textarea-counter" className={styles.Counter}>
          {counterLabel}
        </span>
      )}
    </FormFieldWrapper>
  );
}
