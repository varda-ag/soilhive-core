import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClickAway } from 'react-use';
import type { CSSProperties } from 'react';

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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

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
      if (!isOpen && dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 240) {
          setMenuStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 2, left: rect.left - 2, width: rect.width + 4 });
        } else {
          setMenuStyle({ position: 'fixed', top: rect.bottom + 2, left: rect.left - 2, width: rect.width + 4 });
        }
      }
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

  useClickAway(
    dropdownRef,
    e => {
      if (portalRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    },
    ['click'],
  );

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  useEffect(() => {
    if (Array.isArray(value)) {
      setCurrentValues(value);
    } else {
      setCurrentValues(value ? [value] : []);
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
        {isOpen &&
          createPortal(
            <div ref={portalRef} style={menuStyle} className={styles.PortalMenu}>
              <Menu
                size={size}
                options={options}
                isMultiselect={isMultiselect}
                keepSelection={true}
                selectedOptions={currentlySelectedOptionsCodes}
                showSelectedCheckIcon={showSelectedCheckIcon}
                onSelect={handleSelection}
              />
            </div>,
            document.body,
          )}
      </div>
    </FormFieldWrapper>
  );
}
