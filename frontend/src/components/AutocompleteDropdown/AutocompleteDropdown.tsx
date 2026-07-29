import { useState, useEffect, useCallback } from 'react';
import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import classnames from 'classnames';
import { FormFieldWrapper } from 'components/UI';
import SmallCrossIcon from 'assets/icons/small-cross-icon.svg?react';
import type { ComponentSizeType, MenuOption } from 'types/components';
import styles from './AutocompleteDropdown.module.scss';

interface Props {
  options: MenuOption[];
  value?: string;
  placeholder?: string;
  isDisabled?: boolean;
  size?: ComponentSizeType;
  className?: string;
  label?: string;
  labelTooltip?: string;
  isRequired?: boolean;
  isError?: boolean;
  errorMessage?: string;
  helperMessage?: string;
  onChange: (code: string) => void;
  onClear?: () => void;
}

// Typeahead dropdown for MenuOption[] lists where the stored value is a code
// (e.g. a UUID) but the display value is a human-readable name. Callers always
// deal in codes — the name ↔ code translation is handled internally.
export function AutocompleteDropdown({
  options,
  value,
  placeholder,
  isDisabled,
  size = 'medium',
  className,
  label,
  labelTooltip,
  isRequired,
  isError,
  errorMessage,
  helperMessage,
  onChange,
  onClear,
}: Props) {
  const nameFromCode = useCallback((code: string | undefined) => options.find(o => o.code === code)?.name ?? '', [options]);

  const [displayName, setDisplayName] = useState(() => nameFromCode(value));
  const [filteredOptions, setFilteredOptions] = useState<MenuOption[]>([]);

  // displayName serves two roles: it's what the user is typing (local mutable
  // state) AND it must reflect external changes to `value` (e.g. the parent
  // clears the selection). Because it's editable, we can't compute it purely
  // from props — we need local state. The useEffect is the sync mechanism for
  // the second role: when the parent's committed code changes, reset the
  // display name to the matching option name.
  useEffect(() => {
    setDisplayName(nameFromCode(value));
  }, [value, nameFromCode]);

  const handleFilter = (e: AutoCompleteCompleteEvent) => {
    const q = e.query.toLowerCase();
    setFilteredOptions(options.filter(o => o.name.toLowerCase().includes(q)));
  };

  const handleBlur = () => {
    const match = options.find(o => o.name.toLowerCase() === displayName.toLowerCase());
    if (match) {
      onChange(match.code);
    } else {
      setDisplayName(nameFromCode(value));
    }
  };

  const handleClear = () => {
    onClear?.();
  };

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
      <div className={styles.Wrapper}>
        <AutoComplete
          value={displayName}
          suggestions={filteredOptions}
          field="name"
          completeMethod={handleFilter}
          onChange={e => setDisplayName(typeof e.value === 'string' ? e.value : (e.value as MenuOption).name)}
          onSelect={e => {
            const option = e.value as MenuOption;
            setDisplayName(option.name);
            onChange(option.code);
          }}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={isDisabled}
          dropdown={true}
          className={classnames(styles.Root, { [styles.Small]: size === 'small', [styles.Tiny]: size === 'tiny' })}
          inputClassName={styles.Input}
          panelClassName={styles.Panel}
        />
        {onClear && !!displayName && (
          <button
            className={styles.ClearButton}
            type="button"
            aria-label="Clear selection"
            onMouseDown={e => e.preventDefault()}
            onClick={handleClear}
          >
            <SmallCrossIcon />
          </button>
        )}
      </div>
    </FormFieldWrapper>
  );
}
