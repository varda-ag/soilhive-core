import React from 'react';
import type { PluginContext } from 'frontend-plugin-types';
// After running `soilhive-plugin` against this plugin, UI/ is synced in from the host and
// its components become available like this: import { Button } from '../../UI/Button/Button';
import './ProviderComponent.css';

const Page: React.FC<{ context: PluginContext }> = ({ context }) => {
  const {
    user,
    mapSelection,
    useTheme,
    useDataFilterQuery,
    useFilteredCoverageQuery,
    useSoilProperties,
    usePropertiesCategories,
    useRasterCategories,
    useSoilData,
  } = context;
  const { data: theme } = useTheme();
  const { data: filterId, isLoading: isFilterLoading } = useDataFilterQuery({
    geometries: mapSelection?.geometryFilter ?? [],
    parameters: { data_types: ['point'] },
  });
  const { data: coverage, isLoading: isCoverageLoading } = useFilteredCoverageQuery(filterId);
  const { data: soilProperties, isLoading: isSoilPropertiesLoading } = useSoilProperties();
  const { data: propertiesCategories, isLoading: isPropertiesCategoriesLoading } = usePropertiesCategories();
  const { data: rasterCategories, isLoading: isRasterCategoriesLoading } = useRasterCategories();
  const {
    data: soilData,
    isLoading: isSoilDataLoading,
    hasMore: hasMoreSoilData,
    loadMore: loadMoreSoilData,
  } = useSoilData({
    availableDatasets: coverage?.datasets.map(dataset => dataset.id) ?? [],
    filterId,
    limit: 10,
  });

  return (
    <div className="container">
      <div className="icon-container">
        <img src="https://module-federation.io/svg.svg" alt="logo" className="logo-image" />
      </div>
      <h1 className="title">Hello Module Federation 2.0</h1>
      <p>User from host: {user ? (user.profile?.name ?? user.profile?.email ?? 'authenticated user') : '(none received)'}</p>
      <p>
        Map selection from host:{' '}
        {mapSelection ? `${mapSelection.selectionType} in ${mapSelection.boundingBox ?? 'empty bounding box'}` : '(none received)'}
      </p>
      <p>
        Theme colors from host:{' '}
        {theme
          ? Object.entries(theme.colors)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')
          : '(none received)'}
      </p>
      <p>Data filter id from host: {isFilterLoading ? 'loading…' : (filterId ?? '(none received)')}</p>
      <p>
        Filtered coverage from host:{' '}
        {isCoverageLoading ? 'loading…' : (coverage?.datasets.map(dataset => dataset.name).join(', ') ?? '(none received)')}
      </p>
      <p>
        Soil properties from host:{' '}
        {isSoilPropertiesLoading
          ? 'loading…'
          : (soilProperties?.map(property => property.property_acronym).join(', ') ?? '(none received)')}
      </p>
      <p>
        Properties categories from host:{' '}
        {isPropertiesCategoriesLoading
          ? 'loading…'
          : (propertiesCategories?.map(category => category.category_name).join(', ') ?? '(none received)')}
      </p>
      <p>
        Raster categories from host:{' '}
        {isRasterCategoriesLoading ? 'loading…' : (rasterCategories?.map(category => category.name).join(', ') ?? '(none received)')}
      </p>
      <p>
        Soil data from host: {isSoilDataLoading ? 'loading…' : `${soilData.length} sample(s)`}
        {hasMoreSoilData && (
          // Once UI/ is synced in, swap this for: <Button onClick={loadMoreSoilData}>Load more</Button>
          <button type="button" onClick={loadMoreSoilData}>
            Load more
          </button>
        )}
      </p>
    </div>
  );
};

const name = '★ Name of remote module ★';
const type = 'single-page';
const route = 'remote-module';
export { name, route, type, Page };
