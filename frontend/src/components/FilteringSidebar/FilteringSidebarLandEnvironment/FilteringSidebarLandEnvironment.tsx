import { RasterFilter } from 'components/FilteringSidebar/RasterFilter/RasterFilter';
import useAvailability from 'hooks/useAvailability';
import { isOfferedRasterFilter } from 'utilities/rasterFilter';

export function FilteringSidebarLandEnvironment() {
  const { allRasterCategories } = useAvailability();

  const categories = (allRasterCategories ?? []).filter(isOfferedRasterFilter).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {categories.map(cat => (
        <RasterFilter key={cat.id} categoryId={cat.id} />
      ))}
    </>
  );
}
