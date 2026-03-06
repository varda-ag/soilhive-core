import classNames from 'classnames';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { Button } from 'components/UI';
import styles from './DownloadDataSummary.module.scss';
import ExpandIcon from 'assets/icons/expand-icon.svg?react';
import ReduceIcon from 'assets/icons/reduce-icon.svg?react';
import LayersIcon from 'assets/icons/layers-icon.svg?react';
import MapPinIcon from 'assets/icons/map-pin-icon.svg?react';
import WorldIcon from 'assets/icons/world-icon.svg?react';
import useDevice from 'hooks/useDevice';
import { useTranslation } from 'react-i18next';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';

// console.debug(numberFormatter.format(1234567));
// Output: "1.234.567"
const numberFormatter = new Intl.NumberFormat('de-DE');

interface DownloadDataSummaryProps {
  selectionType?: string;
  initialViewBoundingBox?: [number, number, number, number];
  selectedFeature?: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties>;
  geometryFeature?: any;
  locationName?: string;
  dataPoints?: number;
  rasterLayers?: number;
  depthRange?: string;
  soilProperties?: Array<string>;
  expanded?: boolean;
  onExpandClicked?: (expanded: boolean) => void;
  responsive?: boolean;
}

function DownloadDataSummary({
  selectionType = 'drawn-polygon',
  initialViewBoundingBox,
  geometryFeature,
  selectedFeature,
  locationName,
  dataPoints,
  rasterLayers,
  depthRange,
  soilProperties,
  expanded = false,
  onExpandClicked,
  responsive = true,
}: DownloadDataSummaryProps) {
  const { isDesktopLayout } = useDevice();
  const { t } = useTranslation('download');

  let selectionTitle: string = t('download_data_summary.selection.default');
  if (selectionType === 'h3-cell') {
    selectionTitle = t('download_data_summary.selection.h3cell_selected');
  } else if (selectionType === 'drawn-polygon') {
    selectionTitle = t('download_data_summary.selection.drawn_polygon');
  } else if (selectionType === 'country') {
    selectionTitle = t('download_data_summary.selection.country_selected');
  }

  const isDesktop = !responsive || isDesktopLayout;
  const isAppliedFiltersSectionVisible = depthRange !== undefined || (soilProperties && soilProperties?.length > 0);

  return (
    <div
      className={classNames(responsive ? styles.DownloadDataSummary : styles.DownloadDataSummaryNonResponsive, {
        [styles.Expanded]: isDesktop && expanded,
      })}
    >
      <div className={styles.MapSection}>
        <div className={styles.Map}>
          <SoilhiveSimpleMap
            initialViewBoundingBox={initialViewBoundingBox}
            showH3Cells={selectionType === 'h3-cell'}
            showNavigation={expanded && isDesktop}
            selectedFeature={selectedFeature}
            geometryFeature={geometryFeature}
          />
          {isDesktop && expanded && (
            <Button
              dataTestId="reduce-download-data-summary-button"
              type="tertiary"
              isIconOnly={true}
              onClick={() => onExpandClicked?.(false)}
            >
              <ReduceIcon />
            </Button>
          )}
          {isDesktop && !expanded && (
            <Button
              dataTestId="expand-download-data-summary-button"
              type="tertiary"
              isIconOnly={true}
              onClick={() => onExpandClicked?.(true)}
            >
              <ExpandIcon />
            </Button>
          )}
        </div>
        <div className={styles.SubMap}>
          <div className={styles.SectionTitle}>{selectionTitle}</div>
          {locationName && (
            <div className={styles.Location}>
              <WorldIcon />
              {locationName}
            </div>
          )}
        </div>
      </div>
      <div className={styles.Separator}></div>
      <div className={styles.DataSummary}>
        <div className={styles.SectionTitle}>{t('download_data_summary.data_summary')}</div>
        <div className={styles.DataSummaryContent}>
          <div className={styles.DataSummaryRow}>
            <div className={styles.DataSummaryRowTitle}>
              <MapPinIcon />
              {t('download_data_summary.data_points')}
            </div>
            <div className={styles.DataSummaryRowData}>{dataPoints ? numberFormatter.format(dataPoints) : '0'}</div>
          </div>
          <div className={styles.DataSummaryRow}>
            <div className={styles.DataSummaryRowTitle}>
              <LayersIcon />
              {t('download_data_summary.raster_layers')}
            </div>
            <div className={styles.DataSummaryRowData}>{rasterLayers ? numberFormatter.format(rasterLayers) : '0'}</div>
          </div>
        </div>
      </div>
      <div className={styles.Separator}></div>
      {isAppliedFiltersSectionVisible && (
        <div className={styles.AppliedFilters}>
          <div className={styles.SectionTitle}>{t('download_data_summary.applied_filters')}</div>
          <div className={styles.FiltersList}>
            {depthRange !== undefined && (
              <div className={styles.Filter}>
                <div className={styles.FilterName}>{t('download_data_summary.depth_range')}</div>
                <div className={styles.FilterValue}>{depthRange}</div>
              </div>
            )}
            {soilProperties && soilProperties.length > 0 && (
              <div className={styles.Filter}>
                <div className={styles.FilterName}>{t('download_data_summary.soil_properties')}</div>
                <div className={styles.FilterValue}>{soilProperties.length > 0 ? soilProperties.join(', ') : '-'}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DownloadDataSummary;
