import { RasterFilter } from 'components/FilteringSidebar/RasterFilter/RasterFilter';
import useAvailability from 'hooks/useAvailability';

export function FilteringSidebarLandEcosystem() {
  const { allRasterCategories } = useAvailability();

  const dynamicCategories = allRasterCategories?.filter(c => c.id !== 'soil_groups') ?? []; // <- soil_groups is rendered in the FilteringSidebarParameters, so we exclude it from this section

  return (
    <>
      {dynamicCategories.map(cat => (
        <RasterFilter key={cat.id} categoryId={cat.id} />
      ))}
    </>
  );
}
