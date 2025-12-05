import type { StyleSpecification } from "react-map-gl/maplibre";
import SoilhiveMap from "../components/SoilhiveMap";
import { MAPBOX_ACCESS_TOKEN } from "../utilities/environmentVariables";
import styles from './Homepage.module.scss'

const MAPBOX_SATELLITE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "raster-tiles": {
      type: "raster",
      tiles: [
        `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token=${MAPBOX_ACCESS_TOKEN}`,
      ],
      tileSize: 256
    }
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "raster-tiles"
    }
  ]
};

function Homepage() {
  return (
    <div className={styles.homepage}>
      <SoilhiveMap
        initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]}
        showGeocoder={true}
        showH3Cells={true}
        geocoder={localStorage.getItem('MAP_GEOCODER') ?? 'nominatim' as any}
        mapStyles={[
          {name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'},
          {name: 'Mapbox Satellite', mapStyle: MAPBOX_SATELLITE_MAP_STYLE},
          {name: 'Maplibre Demotile Globe', mapStyle: 'https://demotiles.maplibre.org/globe.json'},
          {name: 'OpenMap Tiles OSM Bright', mapStyle: 'https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json'}
        ]}
      />
    </div>
  );
};

export default Homepage;
