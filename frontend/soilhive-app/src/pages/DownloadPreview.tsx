import { useContext } from 'react';
import { AvailabilityContext } from '../contexts/AvailabilityContext';
import { Button } from 'components/UI';
import styles from './DownloadPreview.module.scss';
import DownloadPreviewTable from 'components/DownloadPreview/DownloadPreviewTable';
import DownloadPreviewSummary from 'components/DownloadPreview/DownloadPreviewSummary';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import BookmarkIcon from 'assets/icons/bookmark-icon.svg?react';

function DownloadPreview() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const { setPreview } = availabilityContext;

  return (
    <div className={styles.Availability}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span>DATA PREVIEW</span>
          <span>Review your selected data before downloading</span>
        </div>
        <div className={styles.Buttons}>
          <Button type="tertiary" isIconOnly={true}>
            <BookmarkIcon />
          </Button>
          <Button
            type="secondary"
            onClick={() => {
              setPreview(false);
            }}
          >
            <ArrowLeftIcon />
            Back to the map
          </Button>
          <Button type="primary">
            <DownloadIcon />
            Download data
          </Button>
        </div>
      </div>
      <div className={styles.Content}>
        <div className={styles.Sidebar}>
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
        <div className={styles.Data}>
          <DownloadPreviewTable />
        </div>
      </div>
    </div>
  );
}

export default DownloadPreview;
