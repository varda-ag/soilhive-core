import { useState } from 'react';
import { Button } from 'components/UI';
import styles from './DownloadSummary.module.scss';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import classNames from 'classnames';
import { useNavigate, useSearchParams } from 'react-router';
import useAvailability from 'hooks/useAvailability';
import DownloadSummarySidebar from 'components/DownloadSummary/DownloadSummarySidebar/DownloadSummarySidebar';

function DownloadSummary() {
  const { geometryFilter, datasetsSummary, selectionType, locationName, boundingBox, selectedSoilProperties, filteredSoilProperties } =
    useAvailability();

  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const comingFromPreview = searchParams.get('source') === 'preview';

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'summary' | 'availability'>('summary');

  return (
    <div className={styles.DownloadSummary}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span className={styles.Title}>DOWNLOAD SUMMARY</span>
          <span className={styles.SubTitle}>Check the datasets you are going to download</span>
        </div>
        <div className={styles.Buttons}>
          <Button
            dataTestId="download-preview-back-button"
            className={styles.BackButton}
            type="secondary"
            // to={comingFromPreview ? '/download' : '/'}
            onClick={() => {
              navigate(-1);
            }}
          >
            <ArrowLeftIcon />
            {comingFromPreview ? 'Back to the download preview' : 'Back to the map'}
          </Button>
        </div>
      </div>
      <div className={styles.Content}>
        <div className={classNames(styles.Sidebar, { [styles.HideInMobile]: selectedTab !== 'summary' })}>
          <DownloadSummarySidebar
            selectionType={selectionType}
            initialViewBoundingBox={boundingBox}
            geometryFeature={{
              type: 'FeatureCollection',
              features: geometryFilter.map(geometry => ({ geometry })),
            }}
            locationName={locationName}
            dataPoints={datasetsSummary.dataPoints}
            rasterLayers={datasetsSummary.layers}
            depthRange={`${datasetsSummary.depth}cm`}
            soilProperties={filteredSoilProperties
              .filter(property => selectedSoilProperties.includes(property.id))
              .map(property => property.property_name)}
            expanded={summaryExpanded}
            onExpandClicked={newExpanded => setSummaryExpanded(newExpanded)}
          />
        </div>
        <div className={classNames(styles.Data, { [styles.HideInMobile]: selectedTab !== 'availability' })}>
          Availability
          <div>
            <pre>
              source: {searchParams.get('source')}
              filterId: {searchParams.get('filterId')}
              datasets: {searchParams.get('datasets')}
            </pre>
          </div>
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

export default DownloadSummary;
