import type { StyleSpecification } from "react-map-gl/maplibre";
import SoilhiveMap from "../components/SoilhiveMap";

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoidmFyZGEtbWFwYm94LWFkbWluIiwiYSI6ImNsZmttZTQweTA5ZTg0M3MwMGlpanplZmsifQ.Tg6f5VFvnSPjGrwV_g6nVg';

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
      source: "raster-tiles",
      // minzoom: 0,
      // maxzoom: 19
    }
  ]
};

function Homepage() {
  return (
    <div className="home-page">
      <h1>Homepage</h1>
      <p style={{color: 'var(--primary-color)'}}>This is the homepage</p>
      <SoilhiveMap showNavigation={false} showGeolocation={false} showScale={false} scrollZoom={false} dragPan={false} />
      <p>Altra mappa</p>
      <SoilhiveMap
        initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]} showGeocoder={true}
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
