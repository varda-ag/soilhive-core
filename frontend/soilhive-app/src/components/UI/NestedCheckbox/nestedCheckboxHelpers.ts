import type { NestedCheckboxItemType } from 'types/components';

export const isNestedLevelHasChildren = (items?: NestedCheckboxItemType[]) => {
  if (!items) return false;
  return !!items.find(item => item.children);
};
