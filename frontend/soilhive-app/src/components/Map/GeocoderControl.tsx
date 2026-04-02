/* global fetch */
import { useState, useMemo, useEffect, type JSX, useCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SearchIcon from 'assets/icons/small-search-icon.svg?react';
import PolygonIcon from 'assets/icons/polygon-icon.svg?react';
import MapPinIcon from 'assets/icons/map-pin-icon.svg?react';
import { useControl, Marker, type ControlPosition, type MarkerProps } from 'react-map-gl/maplibre';
import MaplibreGeocoder, {
  type MaplibreGeocoderApi,
  type MaplibreGeocoderFeatureResults,
  type MaplibreGeocoderOptions,
  type MaplibreGeocoderApiConfig,
  type CarmenGeojsonFeature,
} from '@maplibre/maplibre-gl-geocoder';
import { MAPBOX_ACCESS_TOKEN } from '../../utilities/environmentVariables';
import { bbox as bboxFn, centerOfMass } from '@turf/turf';
import { createPortal } from 'react-dom';

type GeocoderControlProps = Omit<MaplibreGeocoderOptions, 'maplibregl' | 'marker'> & {
  geocoder?: 'nominatim' | 'mapbox';
  marker?: boolean | Omit<MarkerProps, 'longitude' | 'latitude'>;
  position: ControlPosition;
  onLoading?: (e: object) => void;
  onResults?: (e: object) => void;
  onResult?: (e: object) => void;
  onError?: (e: object) => void;
  onFeatureSelect?: (feature: any) => void;
};

function PrependPortal({ children, targetSelector, className }: { children: React.ReactNode; targetSelector: string; className?: string }) {
  const [container] = useState(() => {
    const el = document.createElement('div');
    el.className = className || '';
    return el;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tryPrepend = () => {
      const target = document.querySelector(targetSelector);
      if (!target) return false;
      target.prepend(container);
      setReady(true);
      return true;
    };

    // Try immediately in case it already exists
    if (tryPrepend()) return () => container.remove();

    // Otherwise observe the DOM until it appears
    const observer = new MutationObserver(() => {
      if (tryPrepend()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      container.remove();
    };
  }, [container, targetSelector]);

  if (!ready) return null;
  return createPortal(children, container);
}

const nominatimGeocoderAPI: MaplibreGeocoderApi = {
  forwardGeocode: async (config: MaplibreGeocoderApiConfig): Promise<MaplibreGeocoderFeatureResults> => {
    const features: CarmenGeojsonFeature[] = [];
    try {
      let request = `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
      if (config.bbox) {
        request += `&viewbox=${config.bbox.join(',')}&bounded=0`;
      }
      const response = await fetch(request);
      const geojson = await response.json();
      for (const feature of geojson.features) {
        const carmenGeoJSONFeature = {
          type: 'Feature',
          id: feature.id,
          bbox: bboxFn(feature),
          geometry: {
            type: 'Point',
            coordinates: centerOfMass(feature).geometry.coordinates,
          } as GeoJSON.Point,
          original_feature: feature,
          original_geometry: feature.geometry,
          place_name: feature.properties.display_name,
          properties: feature.properties,
          text: feature.properties.display_name,
          place_type: ['place'],
        } as CarmenGeojsonFeature;
        features.push(carmenGeoJSONFeature);
      }
    } catch (e) {
      console.error(`Failed to forwardGeocode with error: ${e}`);
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  },
};

const mapboxGeocoderAPI: MaplibreGeocoderApi = {
  forwardGeocode: async (config: MaplibreGeocoderApiConfig): Promise<MaplibreGeocoderFeatureResults> => {
    const features: CarmenGeojsonFeature[] = [];
    try {
      let request = `https://api.mapbox.com/search/geocode/v6/forward?q=${config.query}&access_token=${MAPBOX_ACCESS_TOKEN}`;
      if (config.proximity) {
        request += `&proximity=${config.proximity.join(',')}`;
      }
      const response = await fetch(request);
      const geojson = await response.json();
      for (const feature of geojson.features) {
        const carmenGeoJSONFeature = {
          type: 'Feature',
          id: feature.id,
          bbox: feature.properties.bbox,
          geometry: feature.geometry, // Always a point, since Mapbox supports only that
          original_feature: feature,
          original_geometry: feature.geometry,
          place_name: feature.properties.full_address,
          properties: feature.properties,
          text: feature.properties.name,
          place_type: ['place'],
        } as CarmenGeojsonFeature;
        features.push(carmenGeoJSONFeature);
      }
    } catch (e) {
      console.error(`Failed to forwardGeocode with error: ${e}`);
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  },
};

export default function GeocoderControl(props: GeocoderControlProps) {
  const [marker, setMarker] = useState<JSX.Element | null>(null);

  const geocoderAPI = useMemo(() => {
    if (props.geocoder === 'nominatim') {
      return nominatimGeocoderAPI;
    } else if (props.geocoder === 'mapbox') {
      if (!MAPBOX_ACCESS_TOKEN) {
        console.error('Mapbox Geocoder API requires a mapbox access token to be used');
      }
      return mapboxGeocoderAPI;
    } else {
      console.warn('Non-existing or no geocoder specified. Defaulting to nominatim.');
      return nominatimGeocoderAPI;
    }
  }, [props.geocoder]);

  const polygonIconHtml = renderToStaticMarkup(<PolygonIcon />);
  const pointIconHtml = renderToStaticMarkup(<MapPinIcon />);

  const geocoder = useControl<MaplibreGeocoder>(
    () => {
      const isNominatim = props.geocoder === 'nominatim';
      const ctrl = new MaplibreGeocoder(geocoderAPI, {
        marker: false,
        showResultsWhileTyping: !isNominatim,
        minLength: 3,
        proximityMinZoom: 9, // only prioritize the viewport when zoomed in to z9
        debounceSearch: isNominatim ? 1000 : 200, // Nominatim's policy requires to limit searches to maximum 1 request per second https://operations.osmfoundation.org/policies/nominatim/
        clearAndBlurOnEsc: true,
        placeholder: 'Search by any location',
        render: feature => {
          const geomType = (feature as any).original_geometry?.type || '';

          // Pick icon SVG based on geometry type
          const isPolygon = ['Polygon', 'MultiPolygon'].includes(geomType);
          const iconSvg = isPolygon ? polygonIconHtml : pointIconHtml;
          return `
            <div class="maplibregl-ctrl-geocoder--result">
              <div class="maplibregl-ctrl-geocoder--result-icon">
                ${iconSvg}
              </div>
              <div class="maplibregl-ctrl-geocoder--result-title">
                ${feature.place_name}
              </div>
            </div>
          `;
        },
      });
      ctrl.on('loading', _ => {});
      ctrl.on('results', _ => {});
      ctrl.on('clear', _ => {
        setMarker(null);
      });
      ctrl.on('result', evt => {
        const { result } = evt;
        if (!result) {
          setMarker(null);
        }
        if (result.original_geometry.type === 'Point') {
          const [lat, lon] = result.original_geometry.coordinates;
          setMarker(<Marker longitude={lat} latitude={lon} />);
        } else {
          ctrl.clear();
          props.onFeatureSelect?.({
            feature: result.original_feature,
            center: result.geometry,
          });
        }
      });
      return ctrl;
    },
    {
      position: props.position, // Position of the search input inside the Maplibre map component
    },
  );

  const onInput = useCallback(() => {
    geocoder._renderMessage('');
  }, [geocoder]);

  const setSearchButtonState = (searching: boolean) => {
    const searchIcon = document.querySelector('.search-button');
    if (searchIcon) {
      searchIcon.className = searching ? 'search-button searching' : 'search-button';
    }
  };

  const onKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const input = (geocoder as any).container?.querySelector('input') as HTMLInputElement | null;
      if (!input) return;
      const q = input.value.trim();
      const canSearch = q.length >= 3;
      setSearchButtonState(canSearch);
      if (e.key !== 'Enter' || !canSearch) return;

      (geocoder as any)._geocode(q);
    },
    [geocoder],
  );

  function addGeocoderEvents(geocoder: any) {
    if ((geocoder as any).container) {
      document.querySelector('.soilhive-map-toolbar')?.prepend((geocoder as any).container);
    }

    const input = (geocoder as any).container?.querySelector('input') as HTMLInputElement | null;
    if (!input) return;

    input.addEventListener('keyup', onKeyUp);
    input.addEventListener('input', onInput);
    return () => {
      input.removeEventListener('keyup', onKeyUp);
      input.removeEventListener('input', onInput);
    };
  }

  addGeocoderEvents(geocoder);

  if ((geocoder as any)._map) {
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

  function onGeocoderSearch() {
    const input = (geocoder as any).container?.querySelector('input') as HTMLInputElement | null;
    if (!input) return;
    const q = input.value.trim();
    const canSearch = q.length >= 3;
    if (!canSearch) return;
    (geocoder as any)._geocode(q);
  }

  return (
    <>
      {marker}
      <PrependPortal targetSelector=".maplibregl-ctrl-geocoder--pin-right" className="search-button-wrapper">
        <button onClick={onGeocoderSearch} className="search-button">
          <SearchIcon />
        </button>
      </PrependPortal>
    </>
  );
}
