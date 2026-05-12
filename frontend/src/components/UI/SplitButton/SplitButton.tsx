import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import classnames from 'classnames';

import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import type { ComponentSizeType } from 'types/components';

import styles from './SplitButton.module.scss';

export interface SplitButtonOption {
  code: string;
  name: string;
  onSelect: () => void;
  isDisabled?: boolean;
}

interface Props {
  children: ReactNode;
  options: SplitButtonOption[];
  size?: ComponentSizeType;
  onMainClick?: () => void;
  className?: string;
  dataTestId?: string;
}

export function SplitButton({ children, options, size = 'medium', onMainClick, className, dataTestId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const sizeClass = useMemo(
    () =>
      ({
        medium: styles.Medium,
        small: styles.Small,
        tiny: styles.Tiny,
      })[size],
    [size],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleMainClick = useCallback(() => {
    if (onMainClick) {
      onMainClick();
      return;
    }
    setIsOpen(prev => !prev);
  }, [onMainClick]);

  const handleToggle = useCallback(() => setIsOpen(prev => !prev), []);

  const handleOptionClick = useCallback((option: SplitButtonOption) => {
    if (option.isDisabled) return;
    option.onSelect();
    setIsOpen(false);
  }, []);

  return (
    <div ref={wrapperRef} className={classnames(styles.SplitButton, sizeClass, className)} data-testid={dataTestId ?? 'sh-ui-splitbutton'}>
      <button type="button" className={styles.MainPart} onClick={handleMainClick} data-testid="sh-ui-splitbutton-main">
        {children}
      </button>
      <span className={styles.Divider} aria-hidden="true" />
      <button
        type="button"
        className={styles.ChevronPart}
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Toggle options"
        data-testid="sh-ui-splitbutton-toggle"
      >
        <ArrowDownIcon className={classnames(styles.ChevronIcon, { [styles.ChevronOpen]: isOpen })} />
      </button>

      {isOpen && (
        <div className={styles.Popover} role="menu" data-testid="sh-ui-splitbutton-popover">
          {options.map(option => (
            <button
              key={option.code}
              type="button"
              role="menuitem"
              className={classnames(styles.PopoverItem, { [styles.Disabled]: option.isDisabled })}
              disabled={option.isDisabled}
              onClick={() => handleOptionClick(option)}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
