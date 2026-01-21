import { useCallback, useMemo, type ReactNode, type MouseEvent, useState } from 'react';
import classnames from 'classnames';

import type { NestedCheckboxItemType } from 'types/components';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import PlusIcon from 'assets/icons/small-square-plus-icon.svg?react';
import MinusIcon from 'assets/icons/small-square-minus-icon.svg?react';
import { isNestedLevelHasChildren } from '../nestedCheckboxHelpers';

import styles from './NestedCheckboxItem.module.scss';

interface Props {
  item: NestedCheckboxItemType;
  selected: string[];
  className?: string;
  hasChildrenOnCurrentLevel?: boolean;
  isSearching?: boolean;
  isExpanded?: boolean;
  onToggle: (node: NestedCheckboxItemType, checked: boolean) => void;
}

export function NestedCheckboxItem({
  item,
  selected,
  className,
  hasChildrenOnCurrentLevel,
  isSearching = false,
  isExpanded = false,
  onToggle,
}: Props) {
  const [isOpenedInternal, setIsOpenedInternal] = useState<boolean>(false);
  const isOpened = isSearching ? item.children !== undefined : isOpenedInternal;

  const [prevExpanded, setPrevExpanded] = useState(isExpanded);

  if (isExpanded !== prevExpanded) {
    setIsOpenedInternal(isExpanded); // force open
    setPrevExpanded(isExpanded);
  }

  const isChecked = useMemo(() => {
    if (!item.children || item.children.length === 0) {
      return selected.includes(item.id);
    }

    // Parent node: check if ALL descendant leaf nodes are selected
    const getAllDescendantIds = (node: NestedCheckboxItemType): string[] => {
      if (!node.children || node.children.length === 0) {
        return [node.id];
      }
      return node.children.flatMap(getAllDescendantIds);
    };

    const descendantIds = getAllDescendantIds(item);
    return descendantIds.length > 0 && descendantIds.every(id => selected.includes(id));
  }, [item, selected]);

  const isPartiallyChecked = useMemo(() => {
    if (!item.children || item.children.length === 0) {
      return false;
    }

    if (isChecked) {
      return false;
    }

    // Check if at least one descendant is selected
    const getAllDescendantIds = (node: NestedCheckboxItemType): string[] => {
      if (!node.children || node.children.length === 0) {
        return [node.id];
      }
      return node.children.flatMap(getAllDescendantIds);
    };

    const descendantIds = getAllDescendantIds(item);
    return descendantIds.some(id => selected.includes(id));
  }, [item, selected, isChecked]);

  const toggleChildrenVisibility = useCallback(
    (e: MouseEvent<SVGSVGElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpenedInternal(!isOpenedInternal);
    },
    [isOpenedInternal],
  );

  const itemLabel = useMemo((): string | ReactNode => {
    if (item.children?.length) {
      return (
        <>
          {!isOpened && <PlusIcon data-testid="sh-plus-icon" className={styles.ToggleIcon} onClick={toggleChildrenVisibility} />}
          {isOpened && <MinusIcon data-testid="sh-minus-icon" className={styles.ToggleIcon} onClick={toggleChildrenVisibility} />}
          {item.label}
        </>
      );
    }

    return item.label;
  }, [item.children, item.label, isOpened, toggleChildrenVisibility]);

  const isCurrentLevelHasChildren = useMemo(() => {
    return isNestedLevelHasChildren(item.children);
  }, [item.children]);

  return (
    <div className={classnames(styles.NestedCheckboxItem, className)}>
      <Checkbox
        inputClassName={classnames(styles.NestedCheckboxInput, {
          [styles.NestedCheckboxParent]: !!item.children,
          [styles.NestedCheckboxWithSpace]: !item.children && hasChildrenOnCurrentLevel,
        })}
        labelClassName={styles.NestedCheckboxLabel}
        label={itemLabel}
        size="small"
        value={isChecked}
        indeterminate={isPartiallyChecked}
        onChange={checked => onToggle(item, checked)}
      />

      {item.children && isOpened && (
        <div className={styles.NestedCheckboxChildren}>
          {item.children.map(child => (
            <NestedCheckboxItem
              key={child.id}
              item={child}
              selected={selected}
              hasChildrenOnCurrentLevel={isCurrentLevelHasChildren}
              isSearching={isSearching}
              isExpanded={isExpanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
