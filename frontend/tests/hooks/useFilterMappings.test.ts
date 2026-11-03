import { renderHook, act } from '@testing-library/react';
import { useFilterMappings } from 'hooks/useFilterMappings';
import { RasterFilterInstallStatus, type RasterFilter } from 'types/backend';

const makeFilter = (overrides?: Partial<RasterFilter>): RasterFilter => ({
  id: 'land_cover',
  name: 'Land Cover',
  description: 'Copernicus land cover',
  enabled: false,
  active: false,
  mappings: null,
  pixel_values: { '10': 500, '2': 100, '1': 50 },
  suggested_mappings: { '1': 'Water', '2': 'Trees' },
  install: { status: RasterFilterInstallStatus.INSTALLED },
  ...overrides,
});

describe('useFilterMappings', () => {
  it('has no rows before a filter is given', () => {
    const { result } = renderHook(() => useFilterMappings(undefined));

    expect(result.current.rows).toEqual([]);
    expect(result.current.mappings).toEqual({});
  });

  it('has no rows while the filter is not installed', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter({ install: { status: RasterFilterInstallStatus.INSTALLING } })));

    expect(result.current.rows).toEqual([]);
  });

  it('builds one row per pixel value, sorted numerically, labelled with the suggested mappings', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter()));

    expect(result.current.rows).toEqual([
      { pixelValue: '1', label: 'Water' },
      { pixelValue: '2', label: 'Trees' },
      { pixelValue: '10', label: '' },
    ]);
  });

  it('prefers the saved mappings over the suggested ones', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter({ mappings: { '2': 'Forest' } })));

    expect(result.current.rows).toEqual([
      { pixelValue: '1', label: '' },
      { pixelValue: '2', label: 'Forest' },
      { pixelValue: '10', label: '' },
    ]);
  });

  it('falls back to the suggested mappings when the saved ones are empty', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter({ mappings: {} })));

    expect(result.current.rows[0]).toEqual({ pixelValue: '1', label: 'Water' });
  });

  it('builds rows from the saved mappings when the filter has no pixel values', () => {
    const { result } = renderHook(() =>
      useFilterMappings(makeFilter({ pixel_values: null, suggested_mappings: null, mappings: { '7': 'Built Area', '5': 'Crops' } })),
    );

    expect(result.current.rows).toEqual([
      { pixelValue: '5', label: 'Crops' },
      { pixelValue: '7', label: 'Built Area' },
    ]);
  });

  it('keeps the rows when the same filter is given again, so polling does not undo edits', () => {
    const { result, rerender } = renderHook(({ filter }) => useFilterMappings(filter), { initialProps: { filter: makeFilter() } });

    act(() => result.current.handleLabelChange('10', 'Rangeland'));
    rerender({ filter: makeFilter({ suggested_mappings: { '10': 'Something else' } }) });

    expect(result.current.rows[2]).toEqual({ pixelValue: '10', label: 'Rangeland' });
  });

  it('changes the label of one row', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter()));

    act(() => result.current.handleLabelChange('2', 'Forest'));

    expect(result.current.rows[1]).toEqual({ pixelValue: '2', label: 'Forest' });
    expect(result.current.rows[0]).toEqual({ pixelValue: '1', label: 'Water' });
  });

  it('clears a label but keeps its row', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter()));

    act(() => result.current.clearLabel('1'));

    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows[0]).toEqual({ pixelValue: '1', label: '' });
  });

  it('sends only the labelled values, trimmed', () => {
    const { result } = renderHook(() => useFilterMappings(makeFilter()));

    act(() => {
      result.current.handleLabelChange('2', '  Forest ');
      result.current.handleLabelChange('10', '   ');
    });

    expect(result.current.mappings).toEqual({ '1': 'Water', '2': 'Forest' });
  });
});
