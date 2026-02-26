import { RasterFilter } from '../RasterFilter/RasterFilter';
import { useRasterFilters } from '../../../hooks/useRasterFilters';
import Skeleton from 'react-loading-skeleton';

export function FilteringSidebarLandEcosystem() {
  const agro = useRasterFilters('agroecological_zones');
  const land = useRasterFilters('land_cover');

  if (agro.isLoading) {
    return (
      <span data-testid="skeleton-container-raster-filters">
        <Skeleton count={1} height={26} />
      </span>
    );
  }

  if (!agro.categoryData?.enabled && !land.categoryData?.enabled) {
    return null;
  }

  return (
    <>
      {agro.categoryData?.enabled && (
        <RasterFilter
          category={agro.categoryData}
          availableOptions={agro.availableOptions}
          selectedValues={agro.selectedValues}
          pillSelections={agro.pillSelections}
          onChange={agro.handleOnChange}
          onPillRemove={agro.handlePillRemove}
        />
      )}
      {land.categoryData?.enabled && (
        <RasterFilter
          category={land.categoryData}
          availableOptions={land.availableOptions}
          selectedValues={land.selectedValues}
          pillSelections={land.pillSelections}
          onChange={land.handleOnChange}
          onPillRemove={land.handlePillRemove}
        />
      )}
    </>
  );
}
