import { useState } from 'react';
import type { StyleSpecification } from 'react-map-gl/maplibre';

import SoilhiveMap from 'components/Map/SoilhiveMap';
// import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { MAPBOX_ACCESS_TOKEN } from '../utilities/environmentVariables';
import { AvailabilityProvider } from '../contexts/AvailabilityContext';
import DatasetsIcon from 'assets/icons/paste-icon.svg?react';
import FiltersIcon from 'assets/icons/filter2-icon.svg?react';
import { Button } from 'components/UI';
import { DatasetsSidebar } from 'components/DatasetsSidebar/DatasetsSidebar';
import { FilteringSidebar } from 'components/FilteringSidebar/FilteringSidebar';
import { FiltersCounter } from 'components/FilteringSidebar/FiltersCounter/FiltersCounter';
import {
  AVAILABILITY_MOBILE_TABS,
  AvailabilityMobileNavigation,
  DEFAULT_AVAILABILITY_MOBILE_TAB,
} from 'components/AvailabilityMobileNavigation/AvailabilityMobileNavigation';
import useDevice from 'hooks/useDevice';

import styles from './Homepage.module.scss';

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

function Homepage() {
  const [isDatasetsOpened, setIsDatasetsOpened] = useState<boolean>(true);
  const [isFiltersOpened, setIsFiltersOpened] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<string>(DEFAULT_AVAILABILITY_MOBILE_TAB);
  const { isDesktopLayout } = useDevice();

  return (
    <AvailabilityProvider>
      <div className={styles.Homepage}>
        <div className={styles.Content}>
          <FilteringSidebar
            isOpened={isDesktopLayout ? isFiltersOpened : activeMobileTab === AVAILABILITY_MOBILE_TABS.FILTERS}
            onClose={() => setIsFiltersOpened(false)}
          />
          <SoilhiveMap
            initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]}
            showGeocoder={true}
            showH3Cells={true}
            geocoder={localStorage.getItem('MAP_GEOCODER') ?? ('nominatim' as any)}
            mapStyles={[
              { name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
              { name: 'Mapbox Satellite', mapStyle: MAPBOX_SATELLITE_MAP_STYLE },
              { name: 'Maplibre Demotile Globe', mapStyle: 'https://demotiles.maplibre.org/globe.json' },
              { name: 'OpenMap Tiles OSM Bright', mapStyle: 'https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json' },
            ]}
          />
          {/* Example of usage of the soilhive sidebar map to be used in the future download preview page */}
          {/* <SoilhiveSimpleMap
            initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]}
            showH3Cells={true}
            showNavigation={true}
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
          /> */}
          <DatasetsSidebar
            isOpened={isDesktopLayout ? isDatasetsOpened : activeMobileTab === AVAILABILITY_MOBILE_TABS.DATASETS}
            onClose={() => setIsDatasetsOpened(false)}
          />
        </div>

        {isDesktopLayout && !isFiltersOpened && (
          <Button className={styles.FiltersButton} type="custom" onClick={() => setIsFiltersOpened(true)}>
            <>
              <FiltersIcon /> Filters <FiltersCounter />
            </>
          </Button>
        )}

        {isDesktopLayout && !isDatasetsOpened && (
          <Button className={styles.DatasetsButton} type="custom" onClick={() => setIsDatasetsOpened(true)}>
            <>
              <DatasetsIcon /> Datasets
            </>
          </Button>
        )}

        {!isDesktopLayout && <AvailabilityMobileNavigation active={activeMobileTab} onChange={setActiveMobileTab} />}
      </div>
    </AvailabilityProvider>
  );
}

export default Homepage;
