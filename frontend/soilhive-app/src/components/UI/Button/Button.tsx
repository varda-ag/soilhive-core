import { useMemo, type ReactNode, type MouseEventHandler } from 'react'

import classnames from 'classnames'

import styles from './Button.module.scss'
import { Link } from 'react-router';

export type ButtonType = 'primary' | 'secondary' | 'tertiary';
export type ButtonSize = 'medium' | 'small' | 'tiny';
export type ButtonForm = 'button' | 'submit';

export interface ButtonProps {
  children?: ReactNode;
  className?: string;
  type?: ButtonType;
  size?: ButtonSize;
  to?: string;
  href?: string;
  form?: string;
  isIconOnly?: boolean;
  isDanger?: boolean;
  isDisabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export function Button({
    children,
    className,
    type = 'primary',
    size = 'medium',
    to,
    href,
    form,
    isIconOnly,
    isDanger,
    isDisabled,
    onClick,
}: ButtonProps) {

    const typeClass = useMemo(
        () =>
            ({
                primary: styles.Primary,
                secondary: styles.Secondary,
                tertiary: styles.Tertiary,
            }[type]),
        [type]
    )

    const sizeClass = useMemo(
        () =>
            ({
                medium: styles.Medium,
                small: styles.Small,
                tiny: styles.Tiny,
            }[size]),
        [size]
    )

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
                data-testid='sh-ui-button-internal-link'
                to={to}
                className={composedClassNames}
            >
                {children}
            </Link>
        );
    }

    if (href) {
        return (
            <a
                data-testid='sh-ui-button-link'
                href={href}
                className={composedClassNames}
                target='_blank'
                rel='noreferrer'
            >
                {children}
            </a>
        );
    }

    return (
        <button
            data-testid='sh-ui-button'
            type={form ? 'submit' : 'button'}
            form={form}
            className={classnames(
                styles.Button,
                typeClass,
                sizeClass,
                { [styles.Danger]: isDanger },
                { [styles.IconOnly]: isIconOnly },
                className
            )}
            disabled={isDisabled}
            onClick={onClick}
        >
            {children}
        </button>
    )
}
