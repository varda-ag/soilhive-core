import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ForwardedRef,
} from 'react';
import classnames from 'classnames';

import BigCheckIcon from 'assets/icons/big-check-mark-icon.svg?react';
import SmallCheckIcon from 'assets/icons/small-check-mark-icon.svg?react';
import type { MenuOption, ComponentSizeType } from 'types/components';

import styles from './Menu.module.scss';

interface Props {
  className?: string;
  size?: ComponentSizeType;
  options: MenuOption[];
  selectedOption?: string | null;
  keepSelection?: boolean;
  showSelectedCheckIcon?: boolean;
  onSelect: (code: string) => void;
}

export const Menu = forwardRef<HTMLDivElement, Props>(function Menu(
  {
    className,
    size = 'medium',
    options,
    selectedOption,
    keepSelection = true,
    showSelectedCheckIcon = false,
    onSelect,
  },
  ref: ForwardedRef<HTMLDivElement>
) {
  const [currentlySelectedOption, setCurrentlySelectedOption] = useState<string | null>(
    options?.find(({ code }) => code === selectedOption)?.code ?? null
  );

  const sizeClass = useMemo(() => {
    return (
      {
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      }[size]
    );
  }, [size]);

  const CheckIcon = useMemo(() => {
    return size === 'tiny' ? SmallCheckIcon : BigCheckIcon;
  }, [size]);

  const menuOptions = useMemo(
    () =>
      options.map((option) => ({
        ...option,
        isSelected: currentlySelectedOption === option.code,
      })),
    [options, currentlySelectedOption]
  );

  const selectOption = useCallback(
    (optionCode: string) => {
      onSelect(optionCode);

      if (keepSelection) {
        setCurrentlySelectedOption(optionCode);
      }
    },
    [onSelect, keepSelection]
  );

  return (
    <div
      ref={ref}
      data-testid="sh-ui-menu"
      className={classnames(styles.Menu, sizeClass, className)}
    >
      {menuOptions.map(({ code, name, Icon, isDisabled, isSelected }) => (
        <div
          key={code}
          data-testid="sh-ui-menuoption"
          className={classnames(styles.MenuOption, {
            [styles.Selected]: isSelected,
            [styles.Disabled]: isDisabled,
          })}
          onClick={() => !isSelected && !isDisabled && selectOption(code)}
        >
          {Icon && <Icon className={styles.OptionIcon} />}
          <span className={styles.OptionName}>{name}</span>
          {isSelected && showSelectedCheckIcon && <CheckIcon className={styles.CheckIcon} />}
        </div>
      ))}
    </div>
  );
});
