import { useCallback, useMemo, type ReactNode, type MouseEvent } from 'react';
import classnames from 'classnames';

import type { NestedCheckboxItemType } from 'types/components';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';
import PlusIcon from 'assets/icons/small-square-plus-icon.svg?react';
import MinusIcon from 'assets/icons/small-square-minus-icon.svg?react';

import useDevice from 'hooks/useDevice';

import styles from './NestedCheckboxItem.module.scss';

interface Props {
  item: NestedCheckboxItemType;
  selected: string[];
  className?: string;
  expandedIds: string[];
  onToggleVisibility: (id: string, visible: boolean) => void;
  onToggle: (node: NestedCheckboxItemType, checked: boolean) => void;
}

export function NestedCheckboxItem({ item, selected, className, expandedIds, onToggleVisibility, onToggle }: Props) {
  const { isMobileLayout } = useDevice();
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

  const isExpanded = useMemo(() => expandedIds.includes(item.id), [expandedIds, item.id]);

  const toggleChildrenVisibility = useCallback(
    (e: MouseEvent<SVGSVGElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      onToggleVisibility(item.id, !isExpanded);
    },
    [onToggleVisibility, item.id, isExpanded],
  );

  const itemLabel = useMemo((): string | ReactNode => {
    if (item.children?.length) {
      return (
        <>
          {!isExpanded && <PlusIcon data-testid="sh-plus-icon" className={styles.ToggleIcon} onClick={toggleChildrenVisibility} />}
          {isExpanded && <MinusIcon data-testid="sh-minus-icon" className={styles.ToggleIcon} onClick={toggleChildrenVisibility} />}
          {item.label}
        </>
      );
    }

    return item.label;
  }, [item.children, item.label, isExpanded, toggleChildrenVisibility]);

  return (
    <div className={classnames(styles.NestedCheckboxItem, className)}>
      <Checkbox
        inputClassName={styles.NestedCheckboxInput}
        labelClassName={styles.NestedCheckboxLabel}
        label={itemLabel}
        size={isMobileLayout ? 'medium' : 'small'}
        value={isChecked}
        indeterminate={isPartiallyChecked}
        onChange={checked => onToggle(item, checked)}
      />

      {item.children && isExpanded && (
        <div className={styles.NestedCheckboxChildren}>
          {item.children.map(child => (
            <NestedCheckboxItem
              key={child.id}
              item={child}
              selected={selected}
              onToggle={onToggle}
              onToggleVisibility={onToggleVisibility}
              expandedIds={expandedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
