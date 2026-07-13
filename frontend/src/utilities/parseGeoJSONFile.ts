import { check } from '@placemarkio/check-geojson';
import type { Polygon, MultiPolygon } from 'geojson';

function isGeometryCompliant(geometry: any): boolean {
  return geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon');
}

function selectFirstPolygon(json: any): Polygon | MultiPolygon | null {
  if (json.type === 'FeatureCollection') {
    for (const feature of json.features) {
      if (isGeometryCompliant(feature.geometry)) {
        return feature.geometry;
      }
    }
  } else if (json.type === 'Feature') {
    if (isGeometryCompliant(json.geometry)) {
      return json.geometry;
    }
  } else if (isGeometryCompliant(json)) {
    return json;
  }
  return null;
}

export type GeoJSONParseError = {
  id: 'no-file-uploaded' | 'cant-read-file' | 'invalid-json' | 'invalid-polygon';
  message: string;
};

export type GeoJSONParseResult = { polygon: Polygon | MultiPolygon; error?: never } | { polygon?: never; error: GeoJSONParseError };

export async function parseGeoJSONFile(file: File): Promise<GeoJSONParseResult> {
  const text = await file.text();
  if (!text) {
    return { error: { id: 'cant-read-file', message: 'Cannot read uploaded file as text' } };
  }

  let json;
  try {
    json = check(text);
  } catch {
    return { error: { id: 'invalid-json', message: 'Uploaded file does not contain valid GeoJSON' } };
  }

  const polygon = selectFirstPolygon(json);
  if (!polygon) {
    return { error: { id: 'invalid-polygon', message: 'Uploaded file does not contain any valid Polygon or MultiPolygon' } };
  }

  return { polygon };
}
