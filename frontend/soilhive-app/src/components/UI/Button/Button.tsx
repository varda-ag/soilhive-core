import { useMemo, type ReactNode, type MouseEventHandler } from 'react';
import { Link } from 'react-router';
import classnames from 'classnames';
import type { ComponentSizeType } from 'types/components';

import styles from './Button.module.scss';

type ButtonType = 'primary' | 'secondary' | 'tertiary';

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
    onClick,
}: Props) {

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
