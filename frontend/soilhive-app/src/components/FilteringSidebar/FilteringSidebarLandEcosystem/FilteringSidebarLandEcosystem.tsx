import { RasterFilter } from '../RasterFilter/RasterFilter';
import { useRasterFilters } from '../../../hooks/useRasterFilters';

export function FilteringSidebarLandEcosystem() {
  const agro = useRasterFilters('agroecological_zones');
  const land = useRasterFilters('land_cover');

  if (agro.isLoading || (!agro.categoryData?.enabled && !land.categoryData?.enabled)) {
    return null;
  }

  return (
    <>
      {agro.categoryData?.enabled && (
        <RasterFilter category={agro.categoryData} selectedValues={agro.selectedValues} onChange={agro.handleOnChange} />
      )}
      {land.categoryData?.enabled && (
        <RasterFilter category={land.categoryData} selectedValues={land.selectedValues} onChange={land.handleOnChange} />
      )}
    </>
  );
}
