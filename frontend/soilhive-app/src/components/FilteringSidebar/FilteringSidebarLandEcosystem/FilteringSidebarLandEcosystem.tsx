import { RasterFilter } from 'components/FilteringSidebar/RasterFilter/RasterFilter';
import { useRasterFilters } from 'hooks/useRasterFilters';

export function FilteringSidebarLandEcosystem() {
  const agro = useRasterFilters('agroecological_zones');
  const land = useRasterFilters('land_cover');

  return (
    <>
      {agro.category?.enabled && (
        <RasterFilter
          category={agro.category}
          availableOptions={agro.availableOptions}
          selectedValues={agro.selectedValues}
          pillSelections={agro.pillSelections}
          onChange={agro.handleOnChange}
          onPillRemove={agro.handlePillRemove}
        />
      )}
      {land.category?.enabled && (
        <RasterFilter
          category={land.category}
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
