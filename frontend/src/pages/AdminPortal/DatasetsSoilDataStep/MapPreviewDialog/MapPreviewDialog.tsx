import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layer, Source, type LayerProps } from 'react-map-gl/maplibre';
import type { FeatureCollection } from 'geojson';
import { Dialog } from 'components/Dialog/Dialog';
import { FormMessage } from 'components/UI';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import type { Georeference } from 'types/backend';

import styles from './MapPreviewDialog.module.scss';

interface Props {
  visible: boolean;
  fileName: string;
  georeference: Georeference; // [lon, lat] corners
  onClose: () => void;
}

// Where Web Mercator, the map's projection, ends: nothing beyond it can be drawn
const MAP_MAX_LATITUDE = 85.051129;

// Features sharing one point give a zero-area outline, which would otherwise be fitted at the map's max zoom
const FIT_MAX_ZOOM = 14;

const cornersLayer: LayerProps = {
  id: 'georeference-corners',
  type: 'circle',
  paint: {
    'circle-radius': 4,
    'circle-color': '#F5B200',
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-width': 1,
  },
};

export function MapPreviewDialog({ visible, fileName, georeference, onClose }: Props) {
  const { t } = useTranslation('admin');

  const outline = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...georeference, georeference[0]]] } }],
    }),
    [georeference],
  );

  const corners = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: georeference.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } })),
    }),
    [georeference],
  );

  const isBeyondMap = georeference.some(([, lat]) => Math.abs(lat) > MAP_MAX_LATITUDE);

  return (
    <Dialog
      visible={visible}
      header={t('datasets.soil_data.map_preview.header', { name: fileName })}
      hideButtons
      closeOnOverlay
      onClose={onClose}
      className={styles.MapPreviewDialog}
      contentClassName={styles.Content}
    >
      {visible && isBeyondMap && (
        <div className={styles.BeyondMap}>
          <FormMessage message={t('datasets.soil_data.map_preview.beyond_map')} type="warning" />
        </div>
      )}
      {visible && !isBeyondMap && (
        <div className={styles.Map} data-testid="sh-map-preview">
          <SoilhiveSimpleMap geometryFeature={outline} geometryStyle="line" fitBoundsMaxZoom={FIT_MAX_ZOOM}>
            <Source id="georeference-corners" type="geojson" data={corners}>
              <Layer {...cornersLayer} />
            </Source>
          </SoilhiveSimpleMap>
        </div>
      )}
    </Dialog>
  );
}
