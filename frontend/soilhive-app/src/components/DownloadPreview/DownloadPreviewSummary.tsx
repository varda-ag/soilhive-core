import { useState } from 'react';
import classNames from 'classnames';
import type { StyleSpecification } from 'maplibre-gl';
import { MAPBOX_ACCESS_TOKEN } from '../../utilities/environmentVariables';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { Button } from 'components/UI';
import styles from './DownloadPreviewSummary.module.scss';
import DrawerIcon from 'assets/icons/drawer-icon.svg?react';
import LayersIcon from 'assets/icons/layers-icon.svg?react';
import MapPinIcon from 'assets/icons/map-pin-icon.svg?react';
import WorldIcon from 'assets/icons/world-icon.svg?react';

const MAPBOX_SATELLITE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'raster-tiles': {
      type: 'raster',
      tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token=${MAPBOX_ACCESS_TOKEN}`],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'raster-tiles',
    },
  ],
};

interface DownloadPreviewSummaryProps {
  selectionType?: string;
  initialViewBoundingBox?: [number, number, number, number];
  selectedPoint?: [number, number];
  selectedFeature?: any;
  locationName: string;
  dataPoints?: number;
  rasterLayers?: number;
  depthRange?: string;
  soilProperties?: Array<string>;
}

function DownloadPreviewSummary({
  selectionType = 'drawn-polygon',
  initialViewBoundingBox,
  selectedPoint,
  selectedFeature,
  locationName,
  dataPoints,
  rasterLayers,
  depthRange = '-',
  soilProperties = [],
}: DownloadPreviewSummaryProps) {
  const [expanded, setExpanded] = useState(true);

  let selectionTitle: string = 'Selection';
  if (selectionType === 'h3-cell') {
    selectionTitle = 'H3cell selected';
  } else if (selectionType === 'drawn-polygon') {
    selectionTitle = 'Drawn polygon';
  } else if (selectionType === 'country') {
    selectionTitle = 'Country selected';
  }

  return (
    <div className={classNames(styles.DownloadPreviewSummary, { [styles.Expanded]: expanded })}>
      <div className={styles.Map}>
        <SoilhiveSimpleMap
          initialViewBoundingBox={initialViewBoundingBox}
          showH3Cells={selectionType === 'h3-cell'}
          showNavigation={expanded}
          mapStyle={MAPBOX_SATELLITE_MAP_STYLE}
          selectedPoint={selectedPoint}
          selectedFeature={selectedFeature}
        />
        {expanded && (
          <Button type="tertiary" isIconOnly={true} onClick={() => setExpanded(false)}>
            <DrawerIcon />
          </Button>
        )}
      </div>
      <div className={styles.SubMap}>
        <div className={styles.SectionTitle}>{selectionTitle}</div>
        <div className={styles.Location}>
          <WorldIcon />
          {locationName}
        </div>
      </div>
      <div className={styles.Separator}></div>
      <div className={styles.DataSummary}>
        <div className={styles.SectionTitle}>Data summary</div>
        <div className={styles.DataSummaryRow}>
          <div className={styles.DataSummaryRowTitle}>
            <MapPinIcon />
            Data points
          </div>
          <div className={styles.DataSummaryRowData}>{dataPoints ?? '-'}</div>
        </div>
        <div className={styles.DataSummaryRow}>
          <div className={styles.DataSummaryRowTitle}>
            <LayersIcon />
            Raster Layers
          </div>
          <div className={styles.DataSummaryRowData}>{rasterLayers ?? '-'}</div>
        </div>
      </div>
      <div className={styles.Separator}></div>
      <div className={styles.AppliedFilters}>
        <div className={styles.SectionTitle}>Applied Filters</div>
        <div className={styles.FiltersList}>
          <div className={styles.Filter}>
            <div className={styles.FilterName}>Depth range</div>
            <div className={styles.FilterValue}>{depthRange}</div>
          </div>
          <div className={styles.Filter}>
            <div className={styles.FilterName}>Soil Properties</div>
            <div className={styles.FilterValue}>{soilProperties.length > 0 ? soilProperties.join(', ') : '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DownloadPreviewSummary;
