import React, { useCallback, useState, type Ref } from 'react';
import classnames from 'classnames';

import type { NestedCheckboxItemType, NestedCheckboxRef } from 'types/components';
import { NestedCheckboxItem } from './NestedCheckboxItem/NestedCheckboxItem';

import styles from './NestedCheckbox.module.scss';

interface Props {
  ref?: Ref<NestedCheckboxRef>;
  items: NestedCheckboxItemType[];
  selected: string[];
  className?: string;
  onChange: (selected: string[]) => void;
  onToggleVisibility?: (expandedIds: string[]) => void;
}

export function NestedCheckbox({ ref, items, selected, className, onChange, onToggleVisibility }: Props) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const toggleNode = useCallback(
    (node: NestedCheckboxItemType, checked: boolean) => {
      const collectIds = (item: NestedCheckboxItemType): string[] => [item.id, ...item.children.flatMap(collectIds)];

      const ids = collectIds(node);

      const next = checked ? Array.from(new Set([...selected, ...ids])) : selected.filter(id => !ids.includes(id));

      onChange(next);
    },
    [selected, onChange],
  );

  const handleToggleVisibility = useCallback(
    (id: string, isVisible: boolean) => {
      const newVisibleIds = isVisible ? [...expandedIds, id] : expandedIds.filter(item => item !== id);
      setExpandedIds(newVisibleIds);
      onToggleVisibility?.(newVisibleIds);
    },
    [expandedIds, onToggleVisibility],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      expandAll() {
        const ids: string[] = [];
        const collectIds = (items: NestedCheckboxItemType[]) => {
          for (const item of items) {
            ids.push(item.id);
            if (item.children?.length) collectIds(item.children);
          }
        };
        collectIds(items);
        setExpandedIds(ids);
      },

      collapseAll() {
        setExpandedIds([]);
      },
    }),
    [items],
  );

  return (
    <div data-testid="nested-checkbox" className={classnames(styles.NestedCheckbox, className)}>
      {items.map(item => (
        <NestedCheckboxItem
          key={item.id}
          className={item.className}
          item={item}
          selected={selected}
          onToggle={toggleNode}
          expandedIds={expandedIds}
          onToggleVisibility={handleToggleVisibility}
        />
      ))}
    </div>
  );
}
