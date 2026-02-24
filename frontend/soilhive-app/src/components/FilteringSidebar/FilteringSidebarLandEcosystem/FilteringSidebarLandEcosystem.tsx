import { RasterFilter } from '../RasterFilter/RasterFilter';
import { useRasterFilterState } from 'hooks/useRasterFilterState';

export function FilteringSidebarLandEcosystem() {
  const agro = useRasterFilterState('agroecological_zones');
  const land = useRasterFilterState('land_cover');

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
