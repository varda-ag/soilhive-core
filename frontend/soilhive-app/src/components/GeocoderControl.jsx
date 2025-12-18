/* global fetch */
import { useState, useMemo, useEffect } from 'react';
import { useControl, Marker, Source, Layer } from 'react-map-gl/maplibre';
import MaplibreGeocoder, { type MaplibreGeocoderApi, type MaplibreGeocoderOptions, type MaplibreGeocoderApiConfig } from '@maplibre/maplibre-gl-geocoder';
import { MAPBOX_ACCESS_TOKEN } from '../utilities/environmentVariables';
import { bbox, featureCollection } from '@turf/turf';

type GeocoderControlProps = Omit<MaplibreGeocoderOptions, 'maplibregl' | 'marker'> & {
  marker?: boolean | Omit<MarkerProps, 'longitude' | 'latitude'>;
  position: ControlPosition;
  onLoading?: (e: object) => void;
  onResults?: (e: object) => void;
  onResult?: (e: object) => void;
  onError?: (e: object) => void;
  onFeatureSelect?: (feature: any) => void;
};

/* eslint-disable camelcase */
const nominatimGeocoderAPI: MaplibreGeocoderApi = {
  forwardGeocode: async (config: MaplibreGeocoderApiConfig) => {
    const features = [];
    try {
      let request = `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
      if(config.bbox) {
        request += `&viewbox=${config.bbox.join(',')}&bounded=0`;
      }
      const response = await fetch(request);
      const geojson = await response.json();
      for (const feature of geojson.features) {
        const center = [
          feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
          feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2
        ];
        const carmenGeoJSONFeature = {
          type: 'Feature',
          bbox: feature.bbox,
          geometry: {
            type: 'Point',
            coordinates: center
          },
          original_feature: feature,
          original_geometry: feature.geometry,
          place_name: feature.properties.display_name,
          properties: feature.properties,
          text: feature.properties.display_name,
          place_type: ['place']
        };
        features.push(carmenGeoJSONFeature);
      }
    } catch (e) {
      console.error(`Failed to forwardGeocode with error: ${e}`); // eslint-disable-line
    }

    return {
      features
    };
  }
};

const mapboxGeocoderAPI: MaplibreGeocoderApi = {
  forwardGeocode: async (config: MaplibreGeocoderApiConfig) => {
    const features = [];
    try {
      let request = `https://api.mapbox.com/search/geocode/v6/forward?q=${config.query}&access_token=${MAPBOX_ACCESS_TOKEN}`;
      if(config.proximity) {
        request += `&proximity=${config.proximity.join(',')}`;
      }
      const response = await fetch(request);
      const geojson = await response.json();
      for (const feature of geojson.features) {
        const carmenGeoJSONFeature = {
          type: 'Feature',
          bbox: feature.properties.bbox,
          geometry: feature.geometry, // Always a point, since Mapbox supports only that
          original_feature: feature,
          original_geometry: feature.geometry,
          place_name: feature.properties.full_address,
          properties: feature.properties,
          text: feature.properties.name,
          place_type: ['place'],
        };
        features.push(carmenGeoJSONFeature);
      }
    } catch (e) {
      console.error(`Failed to forwardGeocode with error: ${e}`); // eslint-disable-line
    }

    return {
      features
    };
  }
};

/* eslint-disable complexity,max-statements */
export default function GeocoderControl(props: GeocoderControlProps) {
  const [marker, setMarker] = useState(null);

  const geocoderAPI = useMemo(() => {
    if(props.geocoder === 'nominatim') {
      return nominatimGeocoderAPI;
    } else if(props.geocoder === 'mapbox') {
      if(!MAPBOX_ACCESS_TOKEN) {
        console.error('Mapbox Geocoder API requires a mapbox access token to be used');
      }
      return mapboxGeocoderAPI
    } else {
      console.warn('Non-existing or no geocoder specified. Defaulting to nominatim.')
      return nominatimGeocoderAPI;
    }
  }, [props.geocoder]);

  const geocoder = useControl<MaplibreGeocoder>(
    ({mapLib}) => {
      const ctrl = new MaplibreGeocoder(geocoderAPI, {
        marker: false,
        maplibregl: mapLib,
        showResultsWhileTyping: props.geocoder !== 'nominatim' ? true : false, // Nominatim's policy doesn't allow the implementation of an auto-complete https://operations.osmfoundation.org/policies/nominatim/
        proximityMinZoom: 9, // only prioritize the viewport when zoomed in to z9
        debounceSearch: props.geocoder !== 'nominatim' ? 200 : 1000, // Nominatim's policy requires to limit searches to maximum 1 request per second https://operations.osmfoundation.org/policies/nominatim/
        clearAndBlurOnEsc: true,
        placeholder: 'Country, coordinates or H3cellID'
      });
      ctrl.on('loading', (evt) => {
        const bounds = geocoder?._map?.getBounds();
        if(bounds) {
          geocoder.setBbox(bounds.toArray().flat());
        }
        const center = geocoder?._map?.getCenter();
        if(center) {
          geocoder.setProximity({latitude: center.lat, longitude: center.lng });
        }
      });
      ctrl.on('results', (evt) => {
        if(props.geocoder === 'nominatim') {
          const originalFeatures = evt.features.map(feature => feature.original_feature);
          const boundingBox = bbox(featureCollection(originalFeatures));
          geocoder._map.fitBounds(boundingBox);
        }
      });
      ctrl.on('clear', (evt) => {
        setMarker(null);
      });
      ctrl.on('result', evt => {
        const {result} = evt;
        if(!result) {
          setMarker(null);
        }
        if(result.original_geometry.type === 'Point') {
          const [lat, lon] = result.original_geometry.coordinates;
          setMarker(<Marker longitude={lat} latitude={lon} />);
        } else {
          ctrl.clear();
          props.onFeatureSelect?.(result.original_feature);
        }
      });
      return ctrl;
    },
    {
      position: props.position // Position of the search input inside the Maplibre map component
    }
  );

  useEffect(()=> {
    if(geocoder.container) {
      document.querySelector('.soilhive-map-toolbar')?.prepend(geocoder.container);
    }
  }, []);

  // @ts-ignore (TS2339) private member
  if (geocoder._map) {
    if (geocoder.getProximity() !== props.proximity && props.proximity !== undefined) {
      geocoder.setProximity(props.proximity);
    }
    if (geocoder.getRenderFunction() !== props.render && props.render !== undefined) {
      geocoder.setRenderFunction(props.render);
    }
    if (geocoder.getLanguage() !== props.language && props.language !== undefined) {
      geocoder.setLanguage(props.language);
    }
    if (geocoder.getZoom() !== props.zoom && props.zoom !== undefined) {
      geocoder.setZoom(props.zoom);
    }
    if (geocoder.getFlyTo() !== props.flyTo && props.flyTo !== undefined) {
      geocoder.setFlyTo(props.flyTo);
    }
    if (geocoder.getPlaceholder() !== props.placeholder && props.placeholder !== undefined) {
      geocoder.setPlaceholder(props.placeholder);
    }
    if (geocoder.getCountries() !== props.countries && props.countries !== undefined) {
      geocoder.setCountries(props.countries);
    }
    if (geocoder.getTypes() !== props.types && props.types !== undefined) {
      geocoder.setTypes(props.types);
    }
    if (geocoder.getMinLength() !== props.minLength && props.minLength !== undefined) {
      geocoder.setMinLength(props.minLength);
    }
    if (geocoder.getLimit() !== props.limit && props.limit !== undefined) {
      geocoder.setLimit(props.limit);
    }
    if (geocoder.getFilter() !== props.filter && props.filter !== undefined) {
      geocoder.setFilter(props.filter);
    }
    // if (geocoder.getOrigin() !== props.origin && props.origin !== undefined) {
    //   geocoder.setOrigin(props.origin);
    // }
    // if (geocoder.getAutocomplete() !== props.autocomplete && props.autocomplete !== undefined) {
    //   geocoder.setAutocomplete(props.autocomplete);
    // }
    // if (geocoder.getFuzzyMatch() !== props.fuzzyMatch && props.fuzzyMatch !== undefined) {
    //   geocoder.setFuzzyMatch(props.fuzzyMatch);
    // }
    // if (geocoder.getRouting() !== props.routing && props.routing !== undefined) {
    //   geocoder.setRouting(props.routing);
    // }
    // if (geocoder.getWorldview() !== props.worldview && props.worldview !== undefined) {
    //   geocoder.setWorldview(props.worldview);
    // }
  }
  return marker;
}