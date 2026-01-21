import type { NestedCheckboxItemType } from 'types/components';

export const isNestedLevelHasChildren = (items?: NestedCheckboxItemType[]) => {
  if (!items) return false;
  return !!items.find(item => item.children && item.children.length);
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

/**
 * Collects every single ID inside a node,
 * regardless of what the ID is.
 */
const collectAllIds = (item: NestedCheckboxItemType): string[] => {
  const ids = [item.id];
  if (item.children) {
    for (const child of item.children) {
      ids.push(...collectAllIds(child));
    }
  }
  return ids;
};

/**
 * Get all ids from the parent down to the children
 */
export const getBranchIds = (items: NestedCheckboxItemType[], targetId: string): string[] => {
  for (const item of items) {
    if (item.id === targetId) {
      // once found, collect this item and all its descendants
      return collectAllIds(item);
    }

    // if not found yet, look inside the children
    if (item.children) {
      const foundInChildren = getBranchIds(item.children, targetId);
      if (foundInChildren.length > 0) {
        return foundInChildren;
      }
    }
  }
  return [];
};

export const filterNestedItems = (items: NestedCheckboxItemType[], searchTerm: string): NestedCheckboxItemType[] => {
  const query = searchTerm.trim().toLowerCase();

  // If no search term, return the original list immediately
  if (!query) return items;

  // Recursive helper to process a single node
  const getFilteredNode = (item: NestedCheckboxItemType): NestedCheckboxItemType | null => {
    const isMatch = item.label.toLowerCase().includes(query);

    // Recursively filter children if they exist
    const filteredChildren = item.children
      ? item.children.map(getFilteredNode).filter((child): child is NestedCheckboxItemType => !!child)
      : [];

    const hasMatchingChildren = filteredChildren.length > 0;

    // Return node if it matches OR if it has children that match
    if (hasMatchingChildren) {
      return {
        ...item,
        children: filteredChildren,
      };
    }
    if (isMatch) {
      return {
        ...item,
      };
    }

    return null;
  };

  // Map and filter the top-level items

  const res = items.map(getFilteredNode).filter((item): item is NestedCheckboxItemType => !!item);
  return res;
};
