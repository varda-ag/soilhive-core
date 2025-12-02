import { featureCollection } from "@turf/turf";
import { cellToBoundary, type H3Index } from "h3-js";
import type { LngLatBounds } from "maplibre-gl";

export function bboxToGeoJSONFeaturePolygon(bbox: LngLatBounds) {
	return {
		type: 'Feature',
		properties: { code: 'bbox' },
		geometry: {
			type: 'Polygon',
			coordinates: bboxToGeoJSONPolygonCoordinates(bbox)
		}
	};
}

export function bboxToGeoJSONPolygonCoordinates(bbox: LngLatBounds) {
	//bBox is [SW Longitude, SW Latitude , NE Longitude , NE Latitude]
	const { _ne: { lng: _neLng, lat: _neLat }, _sw: { lng: _swLng, lat: _swLat } } = bbox;
	/**
	 * NOTE: polygon formation changed to show properly on the map.
	 * [[_neLng, _neLat],[_swLng, _neLat],[_swLng, _swLat],[_neLng, _swLat],[_neLng, _neLat]],
	 *
	 * Following is the polygon formation used in backend code to generate h3 cells in the bounding box
	 * which works properly
	 * [[neLat, neLng],[swLat, neLng],[swLat, swLng],[neLat, swLng],[neLat, neLng]]
	 */
	return [
		[_neLng, _neLat],
		[_swLng, _neLat],
		[_swLng, _swLat],
		[_neLng, _swLat],
		[_neLng, _neLat]
	];
}

export function h3IndexesToGeoJSONPolygon(h3Index: H3Index) {
	return {
		type: 'Feature',
		properties: { h3Index },
		geometry: {
			type: 'Polygon',
			coordinates: [cellToBoundary(h3Index, true)]
		}
	};
}

export function h3IndexesToGeoJSONPolygons(h3Indexes: Array<H3Index>) {	
	return featureCollection(h3Indexes.map(h3IndexesToGeoJSONPolygon) as any);
}