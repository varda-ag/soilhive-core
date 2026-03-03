import { useEffect, useMemo, useState } from 'react';
import { Button } from 'components/UI';
import styles from './DownloadPreview.module.scss';
import DownloadPreviewSummary from 'components/DownloadPreview//DownloadPreviewSummary/DownloadPreviewSummary';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import ShareIcon from 'assets/icons/share-icon.svg?react';
import BookmarkIcon from 'assets/icons/bookmark-icon.svg?react';
import classNames from 'classnames';
import DownloadPreviewDataSection from 'components/DownloadPreview/DownloadPreviewDataSection/DownloadPreviewDataSection';
import { useSoilData } from 'hooks/useSoilData';
import { useFilteredDatasets } from 'hooks/useFilteredDatasets';
import type { PreviewFilters } from 'types/downloadPreview';
import { computeDatasetSummary } from '../domain';
import type { Nullable } from 'primereact/ts-helpers';
import useAvailability from 'hooks/useAvailability';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';
import { useNavigate } from 'react-router';

const MAXIMUM_SOIL_DATA_PER_REQUEST = 100;

function DownloadPreview() {
  const navigate = useNavigate();

  const {
    setPreview,
    geometryFilter,
    datasetsSummary,
    selectionType,
    locationName,
    boundingBox,
    selectedSoilProperties: availabilitySelectedSoilProperties,
    filteredSoilProperties: availabilityFilteredSoilProperties,
    selectedFilters: availabilitySelectedFilters,
    selectedDatasets: availabilitySelectedDatasets,
    filteredDatasets: availabilityFilteredDatasets,
    availableDatasets: availableFixedDatasets,
    filterId: availabilityFilterId,
  } = useAvailability();

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature<Point | Polygon | MultiPolygon, GeoJsonProperties>>();
  const [sort, setSort] = useState<string>();

  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([availableFixedDatasets[0].id]);

  const availableSoilProperties = useMemo(() => {
    const soilPropertiesIds = [
      ...new Set(
        availableFixedDatasets.filter(dataset => selectedDatasets.includes(dataset.id)).flatMap(dataset => dataset.soil_properties ?? []),
      ),
    ];
    return availabilityFilteredSoilProperties
      .filter(soilProperty => soilPropertiesIds.includes(soilProperty.id))
      .sort((a, b) => a.property_name.localeCompare(b.property_name, 'en', { sensitivity: 'base' }));
  }, [availableFixedDatasets, availabilityFilteredSoilProperties, selectedDatasets]);

  const [filters, setFilters] = useState<PreviewFilters>({
    soil_properties: [availableSoilProperties[0].id],
  });

  useEffect(() => {
    const selectedSoilPropertyId = filters.soil_properties[0];
    // The user has selected another dataset, so the list of available soil properties has changed. If the selected soil
    // property is not available in the newly selected dataset, then we select the first available soil property of the
    // newly selected dataset, otherwise we maintain the selection.
    if (!availableSoilProperties.some(soilProperty => soilProperty.id === selectedSoilPropertyId)) {
      setFilters(prevFilters => ({
        ...prevFilters,
        soil_properties: [availableSoilProperties[0].id],
      }));
    }
  }, [availableSoilProperties, filters.soil_properties]);

  const parameters = {
    geometries: geometryFilter,
    parameters: {
      ...(availabilitySelectedFilters?.filter.parameters ?? {}),
      ...filters,
    },
  };

  const { filterId, data: filteredDatasets, isLoading: areFiltersLoading } = useFilteredDatasets(parameters);

  const availableFilteredDatasets =
    availabilitySelectedDatasets.length > 0
      ? (filteredDatasets ?? availabilityFilteredDatasets).filter(dataset => availabilitySelectedDatasets.includes(dataset.id))
      : (filteredDatasets ?? availabilityFilteredDatasets);

  const { min_sampling_date, max_sampling_date, min_depth, max_depth } = availabilitySelectedFilters?.filter.parameters ?? {};

  const fixedCalendarRange = min_sampling_date && max_sampling_date ? [new Date(min_sampling_date), new Date(max_sampling_date)] : null;
  const fixedDepthRange: Nullable<[number, number]> = min_depth && max_depth ? [min_depth, max_depth] : null;

  const { globalDateStart, globalDateEnd /*globalMinDepth, globalMaxDepth*/ } = computeDatasetSummary(availableFilteredDatasets);
  const calendarMinMaxRange: [Date | undefined, Date | undefined] =
    globalDateStart && globalDateEnd ? [globalDateStart, globalDateEnd] : [undefined, undefined];

  // Implementation of min/max depth range where it changes with the datasets available
  // const depthMinMaxRange: [number | undefined, number | undefined] =
  //   globalMinDepth !== null && globalMaxDepth !== null ? [globalMinDepth, globalMaxDepth] : [undefined, undefined];

  // Implementation of min/max depth range where it stays the same that was in availability page
  const depthMinMaxRange: [number | undefined, number | undefined] =
    datasetsSummary.globalMinDepth !== null && datasetsSummary.globalMaxDepth !== null
      ? [datasetsSummary.globalMinDepth, datasetsSummary.globalMaxDepth]
      : [undefined, undefined];

  const { allData, isLoading, hasMore, loadMore, reset } = useSoilData({
    selectedDatasets,
    availableDatasets: availableFilteredDatasets.map(dataset => dataset.id),
    filterId,
    limit: MAXIMUM_SOIL_DATA_PER_REQUEST + 1,
    sort,
  });

  const [selectedTab, setSelectedTab] = useState<'summary' | 'availability'>('summary');

  return (
    <div className={styles.Availability}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span className={styles.Title}>DOWNLOAD PREVIEW</span>
          <span className={styles.SubTitle}>
            This is a preview of the soil data filtered by the selected area and criteria. To download the data press the button on the
            top-right of this page
          </span>
        </div>
        <div className={styles.Buttons}>
          <Button type="tertiary" isIconOnly={true} className={styles.ShareButton}>
            <ShareIcon />
          </Button>
          <Button type="tertiary" isIconOnly={true} className={styles.BookmarkButton}>
            <BookmarkIcon />
          </Button>
          <Button
            dataTestId="download-preview-back-button"
            className={styles.BackButton}
            type="secondary"
            onClick={() => {
              setPreview(false);
            }}
          >
            <ArrowLeftIcon />
            Back
          </Button>
          <Button
            type="primary"
            className={styles.DownloadButton}
            onClick={() => {
              const params = new URLSearchParams();
              params.append('source', 'preview');
              params.append('selectionType', `${selectionType}`);
              params.append('locationName', `${locationName}`);
              params.append('filterId', `${availabilityFilterId}`);
              params.append('datasets', availableFixedDatasets.map(dataset => dataset.id).join(','));
              navigate({ pathname: '/download', search: `?${params.toString()}` });
            }}
          >
            <DownloadIcon />
            Download data
          </Button>
          <Button type="tertiary" isIconOnly={true} className={styles.ShareButtonForTablet}>
            <ShareIcon />
          </Button>
        </div>
      </div>
      <div className={styles.Content}>
        <div className={classNames(styles.Sidebar, { [styles.HideInMobile]: selectedTab !== 'summary' })}>
          <DownloadPreviewSummary
            selectionType={selectionType}
            initialViewBoundingBox={boundingBox}
            selectedFeature={selectedFeature}
            geometryFeature={{
              type: 'FeatureCollection',
              features: geometryFilter.map(geometry => ({ geometry })),
            }}
            locationName={locationName}
            dataPoints={datasetsSummary.dataPoints}
            rasterLayers={datasetsSummary.layers}
            depthRange={fixedDepthRange ? `${datasetsSummary.depth}cm` : undefined}
            soilProperties={availabilityFilteredSoilProperties
              .filter(property => availabilitySelectedSoilProperties.includes(property.id))
              .map(property => property.property_name)}
            expanded={summaryExpanded}
            onExpandClicked={newExpanded => setSummaryExpanded(newExpanded)}
          />
        </div>
        <div className={classNames(styles.Data, { [styles.HideInMobile]: selectedTab !== 'availability' })}>
          <DownloadPreviewDataSection
            datasets={availableFixedDatasets}
            selectedDatasets={selectedDatasets}
            onDatasetsChange={newDatasets => {
              reset();
              setSelectedDatasets(newDatasets);
            }}
            soilProperties={availableSoilProperties}
            calendarMinMaxRange={calendarMinMaxRange}
            fixedCalendarRange={fixedCalendarRange}
            depthMinMaxRange={depthMinMaxRange}
            fixedDepthRange={fixedDepthRange}
            filters={filters}
            onFiltersChange={newFilters => {
              reset();
              setFilters(newFilters);
            }}
            data={allData}
            isDataLoading={areFiltersLoading || isLoading}
            onTableSort={sort => {
              reset();
              setSort(sort);
            }}
            onTableLastPage={() => {
              if (hasMore) loadMore();
            }}
            onFeatureSelected={feature => {
              setSummaryExpanded(true);
              setSelectedFeature(feature);
            }}
          />
        </div>
      </div>
      <div className={styles.TabsHeader}>
        <Button
          type="custom"
          className={classNames({ [styles.SelectedTabButton]: selectedTab === 'summary' })}
          onClick={() => setSelectedTab('summary')}
        >
          Summary
        </Button>
        <Button
          type="custom"
          className={classNames({ [styles.SelectedTabButton]: selectedTab === 'availability' })}
          onClick={() => setSelectedTab('availability')}
        >
          Table
        </Button>
      </div>
    </div>
  );
}

export default DownloadPreview;
