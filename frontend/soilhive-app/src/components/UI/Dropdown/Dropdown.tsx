import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useClickAway } from 'react-use';

import classnames from 'classnames';

import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import ArrowUpIcon from 'assets/icons/dropdown-arrow-up-icon.svg?react';
import { FormFieldWrapper, Menu } from 'components/UI';
import type { ComponentSizeType, MenuOption } from 'types/components';

import styles from './Dropdown.module.scss'

interface Props {
    className?: string;
    inputClassName?: string;
    size?: ComponentSizeType;
    name?: string;
    label?: string;
    labelTooltip?: string;
    placeholder?: string;
    options: MenuOption[],
    value?: string;
    isRequired?: boolean;
    isDisabled?: boolean;
    isReadOnly?: boolean;
    isError?: boolean;
    errorMessage?: string;
    helperMessage?: string;
    showSelectedCheckIcon?: boolean;
    onChange: (selectedOption: string, name?: string) => void;
};

export function Dropdown({
    className,
    inputClassName,
    size = 'medium',
    name,
    label,
    labelTooltip,
    placeholder = '',
    options,
    value,
    isRequired = false,
    isDisabled,
    isReadOnly,
    isError,
    errorMessage,
    helperMessage,
    showSelectedCheckIcon = false,
    onChange,
}: Props) {

    const getOptionData = useCallback(
        (optionCode: string): MenuOption | undefined => options.find(({ code }) => code === optionCode),
        [options]
    )

    const [currentValue, setCurrentValue] = useState(value)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef(null)

    const sizeClass = useMemo(
        () =>
            ({
                medium: styles.Medium,
                small: styles.Small,
                tiny: styles.Tiny,
            }[size]),
        [size]
    )

    const ArrowIcon = useMemo(
        () => (isOpen ? ArrowUpIcon : ArrowDownIcon),
        [isOpen]
    )

    const currentlySelectedOption = useMemo(
        () => (currentValue ? getOptionData(currentValue) : null),
        [getOptionData, currentValue]
    )

    const toggleDropdown = useCallback(() => {
        if (!isDisabled && !isReadOnly) {
            setIsOpen(!isOpen)
        }
    }, [isOpen, isDisabled, isReadOnly])

    const handleSelection = useCallback(
        (option: string) => {
            setCurrentValue(option)
            setIsOpen(false)
            onChange(option, name)
        },
        [onChange, name]
    )

    useClickAway(dropdownRef, () => setIsOpen(false), ['click'])

    useEffect(() => {
        if (value !== currentValue) {
            setCurrentValue(value)
        }
    }, [value])

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
                data-testid='sh-ui-dropdown'
                className={classnames(
                    styles.Dropdown,
                    sizeClass,
                    { [styles.Active]: isOpen },
                    { [styles.Invalid]: isError },
                    { [styles.Disabled]: isDisabled },
                    { [styles.ReadOnly]: isReadOnly },
                    inputClassName
                )}
                ref={dropdownRef}
            >
                <div className={styles.DropdownInput} onClick={toggleDropdown}>
                    <div
                        className={classnames(styles.SelectedOption, {
                            [styles.Placeholder]: !currentlySelectedOption,
                        })}
                    >
                        {currentlySelectedOption?.name || placeholder}
                    </div>
                    <ArrowIcon className={styles.ArrowIcon} />
                </div>
                {isOpen && (
                    <Menu
                        size={size}
                        className={styles.OptionsList}
                        options={options}
                        selectedOption={currentlySelectedOption?.code}
                        showSelectedCheckIcon={showSelectedCheckIcon}
                        onSelect={handleSelection}
                    />
                )}
            </div>
        </FormFieldWrapper>
    )
}
