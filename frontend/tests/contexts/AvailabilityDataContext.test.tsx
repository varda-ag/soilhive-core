import { act, renderHook } from '@testing-library/react';
import { AvailabilityDataProvider } from '../../src/contexts/AvailabilityDataContext';
import useAvailabilityData from 'hooks/useAvailabilityData';

describe('AvailabilityDataProvider', () => {
  it('throws when useAvailabilityData is used outside of an AvailabilityDataProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useAvailabilityData())).toThrow('useAvailabilityData must be used within an AvailabilityDataProvider');

    spy.mockRestore();
  });

  it('defaults to empty data with loading flags set, since nothing has been reported yet', () => {
    const { result } = renderHook(() => useAvailabilityData(), { wrapper: AvailabilityDataProvider });

    expect(result.current).toMatchObject({
      soilProperties: [],
      isLoadingSoilProperties: true,
      categories: [],
      isLoadingCategories: true,
      rasterCategories: [],
      isLoadingRasterCategories: true,
      visibleDatasets: [],
      isLoadingVisibleDatasets: true,
    });
  });

  it('exposes whatever was last pushed via setAvailabilityData to every consumer', () => {
    const { result } = renderHook(() => useAvailabilityData(), { wrapper: AvailabilityDataProvider });

    act(() => {
      result.current.setAvailabilityData({
        soilProperties: [{ id: 'soil-property-1' }] as never,
        isLoadingSoilProperties: false,
        categories: [{ id: 'category-1' }] as never,
        isLoadingCategories: false,
        rasterCategories: [{ id: 'raster-category-1' }] as never,
        isLoadingRasterCategories: false,
        visibleDatasets: [{ id: 'dataset-1' }] as never,
        isLoadingVisibleDatasets: false,
      });
    });

    expect(result.current).toMatchObject({
      soilProperties: [{ id: 'soil-property-1' }],
      isLoadingSoilProperties: false,
      categories: [{ id: 'category-1' }],
      isLoadingCategories: false,
      rasterCategories: [{ id: 'raster-category-1' }],
      isLoadingRasterCategories: false,
      visibleDatasets: [{ id: 'dataset-1' }],
      isLoadingVisibleDatasets: false,
    });
  });
});
