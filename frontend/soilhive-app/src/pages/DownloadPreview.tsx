import { useContext, useMemo, useRef, useState } from 'react';
import { AvailabilityContext } from '../contexts/AvailabilityContext';
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

const MAXIMUM_SOIL_DATA_PER_REQUEST = 100;

function DownloadPreview() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  // const { setPreview, geometryFilter, datasetsSummary, filterId, selectedFilters: availabilitySelectedFilters, datasets, selectedDatasets } = availabilityContext;
  const { setPreview, geometryFilter, datasetsSummary, filterId, selectedSoilProperties, filteredSoilProperties } = availabilityContext; // TODO rimuovi filterid e te lo ricrei ogni volta con la POST quando cambiano i parametri
  console.debug('availabilityContext', availabilityContext);

  const [filters, setFilters] = useState<{ soil_properties?: string[] }>({});
  const [sort, setSort] = useState<string>();
  const [cursor, setCursor] = useState<string>();

  // const { filte, } = useFilteredDatasets();
  const { data, isLoading } = useSoilData({ datasets: [], filterId, limit: MAXIMUM_SOIL_DATA_PER_REQUEST + 1, cursor, sort });

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
          <Button type="primary" className={styles.DownloadButton}>
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
            selectionType={'drawn-polygon'}
            initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]}
            selectedPoint={[10.522015854087698, 44.441902924546724]}
            selectedFeature={{
              type: 'FeatureCollection',
              features: geometryFilter.map(geometry => ({ geometry })),
            }}
            locationName="France"
            dataPoints={datasetsSummary.dataPoints}
            rasterLayers={datasetsSummary.layers}
            depthRange={`${datasetsSummary.depth}cm`}
            soilProperties={filteredSoilProperties
              .filter(property => selectedSoilProperties.includes(property.id))
              .map(property => property.property_name)}
          />
        </div>
        <div className={classNames(styles.Data, { [styles.HideInMobile]: selectedTab !== 'availability' })}>
          <DownloadPreviewDataSection
            // datasets={}
            // onDatasetSelect={}
            // datasetsDisabled={}
            soilProperties={
              selectedSoilProperties.length === 0
                ? filteredSoilProperties
                : filteredSoilProperties.filter(property => selectedSoilProperties.includes(property.id))
            }
            filters={filters}
            onFiltersChange={newFilters => setFilters(newFilters)}
            data={data}
            isDataLoading={isLoading}
            onTableSort={sort => setSort(sort)}
            onTableLastPage={() => {
              if (data !== undefined && data.length > 0) setCursor(data[data.length - 1].cursor);
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
