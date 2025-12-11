import { useMemo, type ReactNode } from 'react';
import classnames from 'classnames';
import { Tooltip } from 'react-tooltip';

import TooltipIcon from 'assets/icons/small-info-icon.svg?react';
import type { ComponentSizeType } from 'types/components';
import { FormMessage } from 'components/UI';

import styles from './FormFieldWrapper.module.scss';

interface Props {
  className?: string;
  label?: string;
  labelTooltip?: string;
  size: ComponentSizeType;
  isRequired?: boolean;
  isError?: boolean;
  errorMessage?: string;
  helperMessage?: string;
  children: ReactNode;
}

export function FormFieldWrapper({
  className,
  label,
  labelTooltip,
  size,
  isRequired = false,
  isError = false,
  errorMessage,
  helperMessage,
  children,
}: Props) {
  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  return (
    <label data-testid="sh-ui-label" className={classnames(styles.Label, { [styles.Invalid]: isError }, sizeClass, className)}>
      {!!label && (
        <div className={styles.LabelText}>
          <span>{label}</span>
          {isRequired && <span className={styles.RequiredMark}>*</span>}
          {!!labelTooltip && (
            <>
              <TooltipIcon className={styles.LabelTooltip} data-tooltip-id="label-tooltip" data-tooltip-content={labelTooltip} />
              <Tooltip id="label-tooltip" />
            </>
          )}
        </div>
      )}
      {children}
      {!!errorMessage && isError && <FormMessage type="error" message={errorMessage} />}
      {!!helperMessage && <FormMessage type="info" message={helperMessage} />}
    </label>
  );
}
