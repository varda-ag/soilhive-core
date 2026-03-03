import { RasterFilter } from 'components/FilteringSidebar/RasterFilter/RasterFilter';
import useAvailability from 'hooks/useAvailability';

export function FilteringSidebarLandEcosystem() {
  const { allRasterCategories, geometryFilterResults, isLoading: isLoadingDatasets } = useAvailability();

  const dynamicCategories = allRasterCategories?.filter(c => c.id !== 'soil_groups') ?? []; // <- soil_groups is rendered in the FilteringSidebarParameters, so we exclude it from this section

  const hasNoOptions = (catId: string) => !geometryFilterResults?.some(d => (d.raster_filters?.[catId]?.length ?? 0) > 0); // do we have some options in the geomtry result?

  const allEmpty = !isLoadingDatasets && dynamicCategories.length > 0 && dynamicCategories.every(cat => hasNoOptions(cat.id)); // <-- CHANGE: now reads naturally

  if (allEmpty) {
    return <p>For the current geometry no raster filter is available</p>;
  }

  return (
    <>
      {dynamicCategories.map(cat => (
        <RasterFilter key={cat.id} categoryId={cat.id} />
      ))}
    </>
  );
}
