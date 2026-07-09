import { useEffect, useMemo, useState } from 'react';
import { Button } from 'components/UI';
import styles from './DownloadPreview.module.scss';
import DownloadDataSummary from 'components/DownloadDataSummary/DownloadDataSummary';
import DownloadIcon from 'assets/icons/small-download-icon.svg?react';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import ShareIcon from 'assets/icons/share-icon.svg?react';
import BookmarkIcon from 'assets/icons/bookmark-icon.svg?react';
import classNames from 'classnames';
import DownloadPreviewDataSection from 'components/DownloadPreview/DownloadPreviewDataSection/DownloadPreviewDataSection';
import { useSoilData } from 'hooks/useSoilData';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import type { PreviewFilters } from 'types/downloadPreview';
import { computeDatasetSummary } from '../domain';
import type { Nullable } from 'primereact/ts-helpers';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';
import { useNavigate, useSearchParams } from 'react-router';
import { backendToLocalFrontendDate } from '../utilities/date';
import { useTranslation } from 'react-i18next';

import { useDownloadPreview } from 'hooks/useDownloadPreview';

import useDevice from 'hooks/useDevice';

const MAXIMUM_SOIL_DATA_PER_REQUEST = 100;

function DownloadPreview() {
  const navigate = useNavigate();
  const { t } = useTranslation(['download', 'common']);
  const { isMobileLayout } = useDevice();

  const [searchParams] = useSearchParams();
  const selectionType = searchParams.get('selectionType') ?? undefined;
  const locationName = searchParams.get('locationName') ?? undefined;
  const filterId = searchParams.get('filterId') ?? null;
  const datasetsParam = searchParams.get('datasets') ?? undefined;
  const datasetsIds = useMemo(() => (datasetsParam ? datasetsParam.split(',') : []), [datasetsParam]);
  const datasetTypesParam = searchParams.get('dataset-types') ?? undefined;
  const datasetTypesParams = useMemo(() => (datasetTypesParam ? datasetTypesParam.split(',') : []), [datasetTypesParam]);

  const {
    datasetsSummary,
    availableFixedDatasets,
    availabilitySelectedFilters,
    availabilitySelectedSoilProperties,
    availabilityFilteredSoilProperties,
    selectedDatasets,
    nonRasterSelectedDatasets,
    setSelectedDatasets,
    geometryFilter,
    isLoading: isDownloadPreviewLoading,
    isSelectedDatasetRaster,
  } = useDownloadPreview({ filterId, datasetsIds, datasetTypesParams });

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature<Point | Polygon | MultiPolygon, GeoJsonProperties>>();
  const [sort, setSort] = useState<string>();

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
    soil_properties: availableSoilProperties?.[0]?.id ? [availableSoilProperties[0].id] : [],
  });

  // Synchronously resolve the effective soil property so `enabled` is true on the same render
  // that `availableSoilProperties` first becomes non-empty, closing the async-effect gap.
  const effectiveSoilProperties = useMemo(() => {
    const currentId = filters.soil_properties[0];
    if (currentId && availableSoilProperties.some(p => p.id === currentId)) return filters.soil_properties;
    const firstId = availableSoilProperties[0]?.id;
    return firstId ? [firstId] : [];
  }, [filters.soil_properties, availableSoilProperties]);

  useEffect(() => {
    const selectedSoilPropertyId = filters.soil_properties[0];
    // The user has selected another dataset, so the list of available soil properties has changed. If the selected soil
    // property is not available in the newly selected dataset, then we select the first available soil property of the
    // newly selected dataset, otherwise we maintain the selection.
    if (!availableSoilProperties.some(soilProperty => soilProperty.id === selectedSoilPropertyId)) {
      const firstAvailableId = availableSoilProperties?.[0]?.id;
      const nextSoilProperties = firstAvailableId ? [firstAvailableId] : [];
      if (JSON.stringify(filters.soil_properties) !== JSON.stringify(nextSoilProperties)) {
        setFilters(prevFilters => ({
          ...prevFilters,
          soil_properties: nextSoilProperties,
        }));
      }
    }
  }, [availableSoilProperties, filters.soil_properties]);

  const parameters = {
    geometries: geometryFilter,
    parameters: {
      ...(availabilitySelectedFilters?.filter.parameters ?? {}),
      ...filters,
      soil_properties: effectiveSoilProperties,
    },
  };

  const { filterId: downloadPreviewFilterId, isLoading: isLoadingFilter } = useDataFilterQuery(
    parameters,
    effectiveSoilProperties.length > 0,
    0, // No debounce
  );

  const { min_sampling_date, max_sampling_date, min_depth, max_depth } = availabilitySelectedFilters?.filter.parameters ?? {};

  const fixedCalendarRange =
    min_sampling_date && max_sampling_date
      ? [backendToLocalFrontendDate(min_sampling_date), backendToLocalFrontendDate(max_sampling_date)]
      : null;
  const fixedDepthRange: Nullable<[number, number]> = min_depth && max_depth ? [min_depth, max_depth] : null;

  const { globalDateStart, globalDateEnd /*globalMinDepth, globalMaxDepth*/ } = computeDatasetSummary(availableFixedDatasets);
  const calendarMinMaxRange: [Date | undefined, Date | undefined] =
    globalDateStart && globalDateEnd
      ? [backendToLocalFrontendDate(globalDateStart), backendToLocalFrontendDate(globalDateEnd)]
      : [undefined, undefined];

  // Implementation of min/max depth range where it changes with the datasets available
  // const depthMinMaxRange: [number | undefined, number | undefined] =
  //   globalMinDepth !== null && globalMaxDepth !== null ? [globalMinDepth, globalMaxDepth] : [undefined, undefined];

  // Implementation of min/max depth range where it stays the same that was in availability page
  const depthMinMaxRange: [number | undefined, number | undefined] =
    datasetsSummary.globalMinDepth !== null && datasetsSummary.globalMaxDepth !== null
      ? [datasetsSummary.globalMinDepth, datasetsSummary.globalMaxDepth]
      : [undefined, undefined];

  // Changing `selectedDatasets` can also change `availableSoilProperties`, which triggers
  // the effect above to update `filters.soil_properties`. That kicks off a new
  // /data-filters request and, until it returns, `downloadPreviewFilterId` still points at
  // the previous filter. Without the `!isFilterStale` gate, useSoilData would fire once
  // here with the stale `filterId` and again once the fresh `filterId` arrives — two
  // /soil-data requests for a single user action.
  const {
    allData,
    isLoading: isDataLoading,
    hasMore,
    loadMore,
    reset,
  } = useSoilData({
    selectedDatasets: nonRasterSelectedDatasets,
    availableDatasets: availableFixedDatasets.map(dataset => dataset.id),
    filterId: isSelectedDatasetRaster ? undefined : downloadPreviewFilterId,
    limit: MAXIMUM_SOIL_DATA_PER_REQUEST + 1,
    sort,
  });

  const [selectedTab, setSelectedTab] = useState<'summary' | 'availability'>('summary');

  const navigateToDownload = () => {
    const params = new URLSearchParams();
    params.append('source', 'explore');
    params.append('selectionType', `${selectionType}`);
    if (locationName) params.append('locationName', `${locationName}`);
    params.append('filterId', `${filterId}`);
    params.append('datasets', availableFixedDatasets.map(dataset => dataset.id).join(','));
    navigate({ pathname: '/download', search: `?${params.toString()}` });
  };

  return (
    <div className={styles.Availability}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span className={styles.Title}>{t('download_preview.page_title')}</span>
          <span className={styles.SubTitle}>{t('download_preview.page_subtitle')}</span>
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
              navigate(-1);
            }}
          >
            <ArrowLeftIcon />
            {t('download_preview.back')}
          </Button>
          <Button type="primary" className={styles.DownloadButton} isDisabled={isMobileLayout} onClick={navigateToDownload}>
            <DownloadIcon />
            {t('download_preview.download_button')}
          </Button>
        </div>
      </div>
      <div className={styles.Content}>
        <div className={classNames(styles.Sidebar, { [styles.HideInMobile]: selectedTab !== 'summary' })}>
          <DownloadDataSummary
            selectionType={selectionType}
            selectedFeature={selectedFeature}
            geometryFeature={
              geometryFilter
                ? {
                    type: 'FeatureCollection',
                    features: geometryFilter.map(geometry => ({ geometry })),
                  }
                : undefined
            }
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
            isRasterDataset={isSelectedDatasetRaster}
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
            isDataLoading={isLoadingFilter || isDataLoading || isDownloadPreviewLoading}
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
          {t('download_preview.tab_summary')}
        </Button>
        <Button
          type="custom"
          className={classNames({ [styles.SelectedTabButton]: selectedTab === 'availability' })}
          onClick={() => setSelectedTab('availability')}
        >
          {t('download_preview.tab_table')}
        </Button>
      </div>
    </div>
  );
}

export default DownloadPreview;
