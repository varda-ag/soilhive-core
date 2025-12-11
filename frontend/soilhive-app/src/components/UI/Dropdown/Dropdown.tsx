import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useClickAway } from 'react-use';

import classnames from 'classnames';

import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import ArrowUpIcon from 'assets/icons/dropdown-arrow-up-icon.svg?react';
import { FormFieldWrapper, Menu } from 'components/UI';
import type { ComponentSizeType, MenuOption } from 'types/components';

import styles from './Dropdown.module.scss';

interface Props {
  className?: string;
  inputClassName?: string;
  size?: ComponentSizeType;
  name?: string;
  label?: string;
  labelTooltip?: string;
  placeholder?: string;
  options: MenuOption[];
  value?: string | string[];
  isMultiselect?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isError?: boolean;
  errorMessage?: string;
  helperMessage?: string;
  showSelectedCheckIcon?: boolean;
  onChange: (selectedOption: string | string[], name?: string) => void;
}

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
  isMultiselect,
  isRequired = false,
  isDisabled,
  isReadOnly,
  isError,
  errorMessage,
  helperMessage,
  showSelectedCheckIcon = false,
  onChange,
}: Props) {
  const getOptionsData = useCallback(
    (selected: string | string[]): MenuOption[] | undefined => {
      return options.filter(({ code }) => selected.includes(code));
    },
    [options],
  );

  const [currentValues, setCurrentValues] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  const ArrowIcon = useMemo(() => (isOpen ? ArrowUpIcon : ArrowDownIcon), [isOpen]);

  const currentlySelectedOptions = useMemo(
    () => (currentValues.length ? getOptionsData(currentValues) : null),
    [getOptionsData, currentValues],
  );

  const currentlySelectedOptionsCodes = useMemo(() => currentlySelectedOptions?.map(({ code }) => code) || [], [currentlySelectedOptions]);

  const currentlySelectedOptionsString = useMemo(
    () => currentlySelectedOptions?.map(({ name }) => name).join(', ') || '',
    [currentlySelectedOptions],
  );

  const toggleDropdown = useCallback(() => {
    if (!isDisabled && !isReadOnly) {
      setIsOpen(!isOpen);
    }
  }, [isOpen, isDisabled, isReadOnly]);

  const handleSelection = useCallback(
    (options: string[]) => {
      setCurrentValues(options);
      if (isMultiselect) {
        onChange(options, name);
        return;
      }
      setIsOpen(false);
      onChange(options[0], name);
    },
    [onChange, name, isMultiselect],
  );

  useClickAway(dropdownRef, () => setIsOpen(false), ['click']);

  useEffect(() => {
    if (value?.toString() !== currentValues.toString()) {
      setCurrentValues(value ? (Array.isArray(value) ? value : [value]) : []);
    }
  }, [value]);

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
        data-testid="sh-ui-dropdown"
        className={classnames(
          styles.Dropdown,
          sizeClass,
          { [styles.Active]: isOpen },
          { [styles.Invalid]: isError },
          { [styles.Disabled]: isDisabled },
          { [styles.ReadOnly]: isReadOnly },
          inputClassName,
        )}
        ref={dropdownRef}
      >
        <div className={styles.DropdownInput} onClick={toggleDropdown}>
          <div
            className={classnames(styles.SelectedOption, {
              [styles.Placeholder]: !currentlySelectedOptionsString,
            })}
          >
            {currentlySelectedOptionsString || placeholder}
          </div>
          <ArrowIcon className={styles.ArrowIcon} />
        </div>
        {isOpen && (
          <Menu
            ref={menuRef}
            size={size}
            className={styles.OptionsList}
            options={options}
            isMultiselect={isMultiselect}
            keepSelection={true}
            selectedOptions={currentlySelectedOptionsCodes}
            showSelectedCheckIcon={showSelectedCheckIcon}
            onSelect={handleSelection}
          />
        )}
      </div>
    </FormFieldWrapper>
  );
}
