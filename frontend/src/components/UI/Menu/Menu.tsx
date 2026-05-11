import { forwardRef, useCallback, useMemo, useState, type ForwardedRef } from 'react';
import classnames from 'classnames';

import BigCheckIcon from 'assets/icons/big-check-mark-icon.svg?react';
import SmallCheckIcon from 'assets/icons/small-check-mark-icon.svg?react';
import type { MenuOption, ComponentSizeType } from 'types/components';

import styles from './Menu.module.scss';

interface Props {
  className?: string;
  size?: ComponentSizeType;
  options: MenuOption[];
  selectedOptions?: string[] | null;
  isMultiselect?: boolean;
  keepSelection?: boolean;
  showSelectedCheckIcon?: boolean;
  onSelect: (codes: string[]) => void;
}

export const Menu = forwardRef<HTMLDivElement, Props>(function Menu(
  { className, size = 'medium', options, selectedOptions, isMultiselect, keepSelection = false, showSelectedCheckIcon = false, onSelect },
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [currentlySelectedOptions, setCurrentlySelectedOptions] = useState<string[]>(
    options.filter(({ code }) => selectedOptions?.includes(code)).map(({ code }) => code),
  );

  const sizeClass = useMemo(() => {
    return {
      medium: styles.Medium,
      small: styles.Small,
      tiny: styles.Tiny,
    }[size];
  }, [size]);

  const CheckIcon = useMemo(() => {
    return size === 'tiny' ? SmallCheckIcon : BigCheckIcon;
  }, [size]);

  const menuOptions = useMemo(
    () =>
      options.map(option => ({
        ...option,
        isSelected: currentlySelectedOptions?.includes(option.code),
      })),
    [options, currentlySelectedOptions],
  );

  const selectOption = useCallback(
    (optionCode: string, isSelected: boolean) => {
      if (isMultiselect) {
        const newValue = isSelected
          ? currentlySelectedOptions.filter(code => code !== optionCode)
          : [...currentlySelectedOptions, optionCode];

        onSelect(newValue);
        setCurrentlySelectedOptions(newValue);
        return;
      }

      onSelect([optionCode]);
      if (keepSelection) {
        setCurrentlySelectedOptions([optionCode]);
      }
    },
    [onSelect, keepSelection, isMultiselect, currentlySelectedOptions],
  );

  return (
    <div ref={ref} data-testid="sh-ui-menu" className={classnames(styles.Menu, sizeClass, className)}>
      {menuOptions.map(({ code, name, Icon, isDisabled, isSelected }) => (
        <div
          key={code}
          data-testid="sh-ui-menuoption"
          className={classnames(styles.MenuOption, {
            [styles.Selected]: isSelected,
            [styles.Disabled]: isDisabled,
          })}
          onClick={() => !isDisabled && selectOption(code, !!isSelected)}
        >
          {Icon && <Icon className={styles.OptionIcon} />}
          <span className={styles.OptionName}>{name}</span>
          {isSelected && showSelectedCheckIcon && <CheckIcon className={styles.CheckIcon} />}
        </div>
      ))}
    </div>
  );
});
