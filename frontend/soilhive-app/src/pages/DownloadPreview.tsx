import { useContext, useState } from 'react';
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

function DownloadPreview() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const { setPreview } = availabilityContext;
  const [selectedTab, setSelectedTab] = useState<'summary' | 'availability'>('summary');

  return (
    <div className={styles.Availability}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span className={styles.Title}>DOWNLOAD PREVIEW</span>
          <span className={styles.SubTitle}>Customize a data preview from the area selected</span>
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
              features: [
                {
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [9.66796875, 44.9375850039109],
                        [10.404052734375, 45.31352900692258],
                        [11.2060546875, 45.06964120886863],
                        [11.260986328125, 44.45338880030178],
                        [10.52490234375, 44.083639282846434],
                        [9.73388671875, 44.323848072506905],
                        [9.66796875, 44.9375850039109],
                      ],
                    ],
                  },
                  type: 'Feature',
                  properties: {
                    h3Index: '831ea6fffffffff',
                  },
                  id: '831ea6fffffffff',
                  layer: {
                    id: 'data-fills',
                    type: 'fill',
                    source: 'data',
                    paint: {
                      'fill-color': {
                        r: 0.9607843137254902,
                        g: 0.6980392156862745,
                        b: 0,
                        a: 1,
                      },
                      'fill-opacity': 0,
                    },
                    layout: {},
                  },
                  source: 'data',
                  state: {},
                },
              ],
            }}
            locationName="France"
            dataPoints={7367}
            rasterLayers={4}
            depthRange="0-50cm"
            soilProperties={['pH', 'Organic Carbon Content']}
          />
        </div>
        <div className={classNames(styles.Data, { [styles.HideInMobile]: selectedTab !== 'availability' })}>
          <DownloadPreviewDataSection />
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
