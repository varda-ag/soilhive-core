import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClickAway } from 'react-use';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';

import classnames from 'classnames';

import ArrowDownIcon from '../assets/icons/dropdown-arrow-down-icon.svg?react';
import ArrowUpIcon from '../assets/icons/dropdown-arrow-up-icon.svg?react';
import { FormFieldWrapper } from '../FormFieldWrapper/FormFieldWrapper';
import { Menu } from '../Menu/Menu';
import type { ComponentSizeType, MenuOption } from '../types';

import styles from './Dropdown.module.scss';

interface Props {
  className?: string;
  inputClassName?: string;
  optionsClassName?: string;
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
  // Single select only. The field takes typed text, and the menu lists only the options whose name
  // has it, in any case. Enter picks the first of them.
  isSearchable?: boolean;
  // Shown in place of the menu while no option's name has the typed text.
  noMatchesMessage?: string;
  onChange: (selectedOption: string | string[], name?: string) => void;
}

export function Dropdown({
  className,
  inputClassName,
  optionsClassName,
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
  isSearchable = false,
  noMatchesMessage,
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
  const [searchText, setSearchText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // The options whose name has the typed text, or every option while none is typed.
  const shownOptions = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return text ? options.filter(({ name }) => name.toLowerCase().includes(text)) : options;
  }, [options, searchText]);

  const openDropdown = useCallback(() => {
    if (isOpen || isDisabled || isReadOnly) return;
    if (dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 240) {
        setMenuStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 2, left: rect.left - 2, width: rect.width + 4 });
      } else {
        setMenuStyle({ position: 'fixed', top: rect.bottom + 2, left: rect.left - 2, width: rect.width + 4 });
      }
    }
    inputRef.current?.focus();
    setIsOpen(true);
  }, [isOpen, isDisabled, isReadOnly]);

  // Closing drops the typed text.
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchText('');
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isOpen, openDropdown, closeDropdown]);

  const handleSelection = useCallback(
    (options: string[]) => {
      setCurrentValues(options);
      if (isMultiselect) {
        onChange(options, name);
        return;
      }
      closeDropdown();
      onChange(options[0], name);
    },
    [onChange, name, isMultiselect, closeDropdown],
  );

  // Enter picks the first option the typed text shows, ArrowDown opens, and Escape and Tab close.
  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        // Never submits a form around the field.
        event.preventDefault();
        const firstMatch = shownOptions.find(({ isDisabled }) => !isDisabled);
        if (isOpen && searchText.trim() && firstMatch) {
          handleSelection([firstMatch.code]);
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        openDropdown();
      } else if (event.key === 'Escape' && isOpen) {
        // Only the menu closes, not a modal around the field.
        event.stopPropagation();
        closeDropdown();
      } else if (event.key === 'Tab') {
        closeDropdown();
      }
    },
    [shownOptions, isOpen, searchText, handleSelection, openDropdown, closeDropdown],
  );

  // Not through the label: it would focus the field, and so open the menu again.
  const handleArrowClick = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDropdown();
    },
    [toggleDropdown],
  );

  useClickAway(
    dropdownRef,
    e => {
      if (portalRef.current?.contains(e.target as Node)) return;
      closeDropdown();
    },
    ['click'],
  );

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: Event) => {
      // The typed text can scroll the field.
      if (portalRef.current?.contains(event.target as Node) || dropdownRef.current?.contains(event.target as Node)) return;
      closeDropdown();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, closeDropdown]);

  useEffect(() => {
    if (Array.isArray(value)) {
      setCurrentValues(value);
    } else {
      setCurrentValues(value ? [value] : []);
    }
  }, [value]);

  const hasNoMatches = shownOptions.length === 0 && searchText.trim() !== '';
  // Focused, the field holds the typed text, and shows the selected option in its place.
  const showsSelectionAsPlaceholder = isFocused && !!currentlySelectedOptionsString;

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
          { [styles.Searchable]: isSearchable },
          inputClassName,
        )}
        ref={dropdownRef}
      >
        <div className={styles.DropdownInput} onClick={isSearchable ? openDropdown : toggleDropdown}>
          {isSearchable ? (
            <input
              ref={inputRef}
              className={classnames(styles.SelectedOption, styles.SearchInput, { [styles.ShowsSelection]: showsSelectionAsPlaceholder })}
              role="combobox"
              aria-expanded={isOpen}
              aria-autocomplete="list"
              autoComplete="off"
              value={isFocused ? searchText : currentlySelectedOptionsString}
              placeholder={showsSelectionAsPlaceholder ? currentlySelectedOptionsString : placeholder}
              disabled={isDisabled}
              readOnly={isReadOnly}
              onFocus={() => {
                setIsFocused(true);
                openDropdown();
              }}
              onBlur={() => setIsFocused(false)}
              onChange={event => {
                setSearchText(event.target.value);
                openDropdown();
              }}
              onKeyDown={handleSearchKeyDown}
            />
          ) : (
            <div
              className={classnames(styles.SelectedOption, {
                [styles.Placeholder]: !currentlySelectedOptionsString,
              })}
            >
              {currentlySelectedOptionsString || placeholder}
            </div>
          )}
          <ArrowIcon className={styles.ArrowIcon} onClick={isSearchable ? handleArrowClick : undefined} />
        </div>
        {isOpen &&
          createPortal(
            <div
              ref={portalRef}
              style={menuStyle}
              className={classnames(styles.PortalMenu, { [styles.Hidden]: hasNoMatches && !noMatchesMessage })}
            >
              {/* Hidden, not unmounted, while nothing matches: the Menu reads the selected option only once. */}
              <Menu
                size={size}
                className={classnames(styles.FullWidthMenu, { [styles.Hidden]: hasNoMatches }, optionsClassName)}
                options={shownOptions}
                isMultiselect={isMultiselect}
                keepSelection={true}
                selectedOptions={currentlySelectedOptionsCodes}
                showSelectedCheckIcon={showSelectedCheckIcon}
                onSelect={handleSelection}
              />
              {hasNoMatches && <div className={classnames(styles.NoMatches, sizeClass)}>{noMatchesMessage}</div>}
            </div>,
            document.body,
          )}
      </div>
    </FormFieldWrapper>
  );
}
