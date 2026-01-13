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
      { id: '1', label: 'Item 1' },
      { id: '2', label: 'Item 2' },
    ];
    expect(isNestedLevelHasChildren(items)).toBe(false);
  });

  it('returns true if at least one item contains children', () => {
    const items: NestedCheckboxItemType[] = [
      { id: '1', label: 'Item 1' },
      {
        id: '2',
        label: 'Item 2',
        children: [{ id: '2-1', label: 'Child' }],
      },
    ];
    expect(isNestedLevelHasChildren(items)).toBe(true);
  });
});
