import { isNestedLevelHasChildren } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
import type { NestedCheckboxItemType } from 'types/components';

describe('isNestedLevelHasChildren', () => {
  it('returns false if items is undefined', () => {
    expect(isNestedLevelHasChildren(undefined)).toBe(false);
  });

  it('returns false if items is an empty array', () => {
    expect(isNestedLevelHasChildren([])).toBe(false);
  });

  it('returns false if no item contains children', () => {
    const items: NestedCheckboxItemType[] = [
      { id: '1', label: 'Item 1', isRoot: true, children: [] },
      { id: '2', label: 'Item 2', isRoot: true, children: [] },
    ];
    expect(isNestedLevelHasChildren(items)).toBe(false);
  });

  it('returns true if at least one item contains children', () => {
    const items: NestedCheckboxItemType[] = [
      { id: '1', label: 'Item 1', isRoot: true, children: [] },
      {
        id: '2',
        label: 'Item 2',
        isRoot: true,
        children: [{ id: '2-1', label: 'Child', isRoot: false, children: [] }],
      },
    ];
    expect(isNestedLevelHasChildren(items)).toBe(true);
  });
});
