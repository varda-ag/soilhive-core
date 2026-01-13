import type { NestedCheckboxItemType } from 'types/components';

export const isNestedLevelHasChildren = (items?: NestedCheckboxItemType[]) => {
  if (!items) return false;
  return !!items.find(item => item.children);
};

export const getLeafSelections = (items: NestedCheckboxItemType[], selected: string[]): NestedCheckboxItemType[] => {
  const result: NestedCheckboxItemType[] = [];

  const traverse = (items: NestedCheckboxItemType[]) => {
    items.forEach(item => {
      if (item.children && item.children.length > 0) {
        // Has children, traverse them regardless of parent selection
        traverse(item.children);
      } else if (selected.includes(item.id)) {
        // It's a leaf node and it's selected
        result.push(item);
      }
    });
  };

  traverse(items);
  return result;
};
