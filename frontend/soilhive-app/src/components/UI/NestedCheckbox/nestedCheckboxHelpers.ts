import type { NestedCheckboxItemType } from 'types/components';

export const isNestedLevelHasChildren = (items?: NestedCheckboxItemType[]) => {
  if (!items) return false;
  return !!items.find(item => item.children);
};

/**
 * Flattens a selection of nested items by returning the highest-level
 * nodes that are fully selected.
 * @param {NestedCheckboxItemType[]} items - The hierarchy of checkbox items.
 * @param {string[]} selected - List of currently selected leaf node IDs.
 * @returns {NestedCheckboxItemType[]} Top level list of selected nodes.
 */
export const getTopLevelSelections = (items: NestedCheckboxItemType[], selected: string[]): NestedCheckboxItemType[] => {
  const result: NestedCheckboxItemType[] = [];

  const getAllDescendantIds = (item: NestedCheckboxItemType): string[] => {
    if (!item.children || item.children.length === 0) {
      return [item.id];
    }
    return item.children.flatMap(getAllDescendantIds);
  };

  const traverse = (item: NestedCheckboxItemType) => {
    const descendantIds = getAllDescendantIds(item);
    const allDescendantsSelected = descendantIds.every(id => selected.includes(id));

    if (allDescendantsSelected && descendantIds.length > 0) {
      // All descendants selected, add parent
      result.push(item);
    } else if (item.children) {
      // Some descendants selected, traverse children
      item.children.forEach(traverse);
    } else if (selected.includes(item.id)) {
      // Leaf node selected
      result.push(item);
    }
  };

  items.forEach(traverse);
  return result;
};
