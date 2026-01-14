import { isNestedLevelHasChildren, getTopLevelSelections } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
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

describe('getTopLevelSelections', () => {
  const mockItems: NestedCheckboxItemType[] = [
    {
      id: '1',
      label: 'Parent 1',
      children: [
        { id: '1-1', label: 'Child 1-1' },
        { id: '1-2', label: 'Child 1-2' },
      ],
    },
    {
      id: '2',
      label: 'Parent 2',
      children: [
        {
          id: '2-1',
          label: 'Parent 2-1',
          children: [
            { id: '2-1-1', label: 'Child 2-1-1' },
            { id: '2-1-2', label: 'Child 2-1-2' },
          ],
        },
      ],
    },
    { id: '3', label: 'Leaf without parent' },
  ];

  it.each([
  ['leaf when only leaf selected', ['1-1'], ['1-1']],
  ['parent when all children selected', ['1-1', '1-2'], ['1']],
  ['mix when partial selection', ['1-1', '2-1-1', '2-1-2'], ['1-1', '2']],
  ['empty array when nothing selected', [], []],
])('returns %s', (_desc, selected, expectedIds) => {
  const result = getTopLevelSelections(mockItems, selected);
  expect(result.map(item => item.id)).toEqual(expectedIds);
});
});