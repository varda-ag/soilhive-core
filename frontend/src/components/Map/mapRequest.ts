import type { Map as MapLibreMap } from 'maplibre-gl';

// Lets code that only has the DOM (the dashboard PDF export) reach the map drawn in a
// .maplibregl-map element: it asks the element, and the map answers. dispatchEvent runs the
// listener before it returns, so the answer is there at once. The event doesn't bubble: only the
// element's own map answers.
const MAP_REQUEST_EVENT = 'soilhive:map-request';

type MapRequest = CustomEvent<{ respond: (map: MapLibreMap) => void }>;

// Has `map` answer the requests made on its container. The listener goes with the container.
export function answerMapRequests(map: MapLibreMap) {
  map.getContainer().addEventListener(MAP_REQUEST_EVENT, event => (event as MapRequest).detail.respond(map));
}

// The map drawn in `container`, or undefined when there's none (yet).
export function requestMap(container: HTMLElement): MapLibreMap | undefined {
  let map: MapLibreMap | undefined;
  container.dispatchEvent(new CustomEvent(MAP_REQUEST_EVENT, { detail: { respond: (answer: MapLibreMap) => (map = answer) } }));
  return map;
}
