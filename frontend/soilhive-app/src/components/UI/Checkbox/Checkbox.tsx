import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import classnames from 'classnames'

import type { ComponentSizeType } from 'types/components';

import styles from './CheckBox.module.scss'

interface Props {
    className?: string;
    inputClassName?: string;
    labelClassName?: string;
    name?: string;
    label?: string;
    size?: ComponentSizeType;
    value?: boolean;
    isError?: boolean;
    isDisabled?: boolean;
    onChange?: (value: boolean, name?: string) => void;
}

export function Checkbox({
    className,
    inputClassName,
    labelClassName,
    name,
    label,
    size = 'medium',
    value = false,
    isError,
    isDisabled,
    onChange,
}: Props) {
    const [currentValue, setCurrentValue] = useState(value);

    const sizeClass = {
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny
    }[size];

    const handleChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            let { checked } = e.target
            setCurrentValue(checked)
            onChange?.(checked, name)
        },
        [onChange, name]
    );

    useEffect(() => {
        if (value !== currentValue) {
            setCurrentValue(value)
        }
    }, [value])

    return (
        <label
            data-testid='sh-ui-checkbox'
            className={classnames(
                styles.CheckBox,
                sizeClass,
                { [styles.Checked]: currentValue },
                { [styles.Marginless]: !label },
                { [styles.Error]: isError },
                { [styles.Disabled]: isDisabled },
                className
            )}
            onClick={(e) => e.stopPropagation()}
        >
            <input
                type='checkbox'
                checked={currentValue}
                onChange={handleChange}
                disabled={isDisabled}
                className={classnames(styles.Input, inputClassName)}
            />
            {label && (
                <div
                    className={classnames(
                        styles.Label,
                        {
                            'small-text': size === 'small',
                            'normal-text': size === 'medium',
                        },
                        labelClassName
                    )}
                >
                    {label}
                </div>
            )}
        </label>
    )
}
