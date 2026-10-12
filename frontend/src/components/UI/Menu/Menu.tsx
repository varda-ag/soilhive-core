import { Fragment, forwardRef, useCallback, useMemo, useState, type ForwardedRef } from 'react';
import classnames from 'classnames';

import BigCheckIcon from '../assets/icons/big-check-mark-icon.svg?react';
import SmallCheckIcon from '../assets/icons/small-check-mark-icon.svg?react';
import type { ComponentSizeType, MenuOption } from '../types';

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

  // Options without a group first, then each group under one heading, in the order the groups first
  // appear. Options keep their order within a group.
  const menuGroups = useMemo(() => {
    const groups = new Map<string, (MenuOption & { isSelected: boolean })[]>([['', []]]);
    options.forEach(option => {
      const group = option.group || '';
      groups.set(group, [...(groups.get(group) ?? []), { ...option, isSelected: currentlySelectedOptions.includes(option.code) }]);
    });
    return [...groups].filter(([, groupOptions]) => groupOptions.length > 0);
  }, [options, currentlySelectedOptions]);

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
      {menuGroups.map(([group, groupOptions]) => (
        <Fragment key={group}>
          {group && (
            <div data-testid="sh-ui-menugroup" className={styles.GroupLabel}>
              {group}
            </div>
          )}
          {groupOptions.map(({ code, name, Icon, isDisabled, isSelected }) => (
            <div
              key={code}
              data-testid="sh-ui-menuoption"
              className={classnames(styles.MenuOption, {
                [styles.Selected]: isSelected,
                [styles.Disabled]: isDisabled,
              })}
              onClick={() => !isDisabled && selectOption(code, isSelected)}
            >
              {Icon && <Icon className={styles.OptionIcon} />}
              <span className={styles.OptionName}>{name}</span>
              {isSelected && showSelectedCheckIcon && <CheckIcon className={styles.CheckIcon} />}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
});
