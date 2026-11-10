import { useMemo, type ReactNode, type MouseEventHandler } from 'react';
import { Link } from 'react-router';
import classnames from 'classnames';
import type { ComponentSizeType } from '../types';

import styles from './Button.module.scss';

type ButtonType = 'primary' | 'secondary' | 'tertiary' | 'custom';

export interface Props {
  children?: ReactNode;
  className?: string;
  type?: ButtonType;
  size?: ComponentSizeType;
  to?: string;
  href?: string;
  form?: string;
  isIconOnly?: boolean;
  isDanger?: boolean;
  isDisabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  dataTestId?: string;
  /** Rendered as data-analytics: a click on the button is sent to Google Analytics as the event of this name (docs/frontend/analytics.md) */
  dataAnalytics?: string;
  /** Rendered as data-analytics-value, sent with that event as click_value */
  dataAnalyticsValue?: string;
  ariaLabel?: string;
  title?: string;
}

export function Button({
  children,
  className,
  type = 'primary',
  size = 'small',
  to,
  href,
  form,
  isIconOnly,
  isDanger,
  isDisabled,
  dataTestId,
  dataAnalytics,
  dataAnalyticsValue,
  ariaLabel,
  title,
  onClick,
}: Props) {
  const analyticsAttributes = { 'data-analytics': dataAnalytics, 'data-analytics-value': dataAnalyticsValue };

  const typeClass = useMemo(
    () =>
      ({
        primary: styles.Primary,
        secondary: styles.Secondary,
        tertiary: styles.Tertiary,
        custom: styles.Custom,
      })[type],
    [type],
  );

  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  const composedClassNames = classnames(
    styles.Button,
    { [typeClass]: !isDanger || typeClass === styles.Tertiary },
    sizeClass,
    { [styles.Danger]: isDanger },
    { [styles.IconOnly]: isIconOnly },
    className,
  );

  if (to) {
    return (
      <Link
        data-testid={dataTestId ?? 'sh-ui-button-internal-link'}
        {...analyticsAttributes}
        to={to}
        className={composedClassNames}
        aria-label={ariaLabel}
        title={title}
      >
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        data-testid={dataTestId ?? 'sh-ui-button-link'}
        {...analyticsAttributes}
        href={href}
        className={composedClassNames}
        target="_blank"
        rel="noreferrer"
        aria-label={ariaLabel}
        title={title}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      data-testid={dataTestId ?? 'sh-ui-button'}
      {...analyticsAttributes}
      type={form ? 'submit' : 'button'}
      form={form}
      className={classnames(
        styles.Button,
        typeClass,
        sizeClass,
        { [styles.Danger]: isDanger },
        { [styles.IconOnly]: isIconOnly },
        className,
      )}
      disabled={isDisabled}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
