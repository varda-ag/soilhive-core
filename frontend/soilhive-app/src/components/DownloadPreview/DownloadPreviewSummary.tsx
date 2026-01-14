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

function DownloadPreviewSummary() {
  const [expanded, setExpanded] = useState(true);
  const selectionType: string = 'drawn-polygon';
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
          initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]}
          showH3Cells={true}
          showNavigation={expanded}
          mapStyle={MAPBOX_SATELLITE_MAP_STYLE}
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
          France
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
          <div className={styles.DataSummaryRowData}>7367</div>
        </div>
        <div className={styles.DataSummaryRow}>
          <div className={styles.DataSummaryRowTitle}>
            <LayersIcon />
            Raster Layers
          </div>
          <div className={styles.DataSummaryRowData}>4</div>
        </div>
      </div>
      <div className={styles.Separator}></div>
      <div className={styles.AppliedFilters}>
        <div className={styles.SectionTitle}>Applied Filters</div>
        <div className={styles.FiltersList}>
          <div className={styles.Filter}>
            <div className={styles.FilterName}>Depth range</div>
            <div className={styles.FilterValue}>0-50cm</div>
          </div>
          <div className={styles.Filter}>
            <div className={styles.FilterName}>Soil Properties</div>
            <div className={styles.FilterValue}>pH, Organic Carbon Content</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DownloadPreviewSummary;
