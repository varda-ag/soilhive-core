import { useCallback, useMemo } from 'react';
import classnames from 'classnames';

import type { NestedCheckboxItemType } from 'types/components';
import { NestedCheckboxItem } from './NestedCheckboxItem/NestedCheckboxItem';
import { isNestedLevelHasChildren } from './nestedCheckboxHelpers';

import styles from './NestedCheckbox.module.scss';

interface Props {
  items: NestedCheckboxItemType[];
  selected: string[];
  className?: string;
  isSearching?: boolean;
  isExpanded?: boolean;
  onChange: (selected: string[]) => void;
}

export function NestedCheckbox({ items, selected, className, isSearching = false, isExpanded = false, onChange }: Props) {
  const toggleNode = useCallback(
    (node: NestedCheckboxItemType, checked: boolean) => {
      const collectIds = (item: NestedCheckboxItemType): string[] => [item.id, ...(item.children?.flatMap(collectIds) ?? [])];

      const ids = collectIds(node);

      const next = checked ? Array.from(new Set([...selected, ...ids])) : selected.filter(id => !ids.includes(id));

      onChange(next);
    },
    [selected, onChange],
  );

  const hasChildrenOnCurrentLevel = useMemo(() => {
    return isNestedLevelHasChildren(items);
  }, [items]);

  return (
    <div data-testid="nested-checkbox" className={classnames(styles.NestedCheckbox, className)}>
      {items.map(item => (
        <NestedCheckboxItem
          key={item.id}
          className={item.className}
          item={item}
          selected={selected}
          hasChildrenOnCurrentLevel={hasChildrenOnCurrentLevel}
          isSearching={isSearching}
          isExpanded={isExpanded}
          onToggle={toggleNode}
        />
      ))}
    </div>
  );
}
