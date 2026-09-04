import type { MultiPolygon } from 'geojson';

const WKB_BYTE_ORDER_LE = 1;
const WKB_TYPE_POLYGON = 3;
const WKB_TYPE_MULTIPOLYGON = 6;
const DOUBLE_SIZE = 8;

/**
 * Encodes a GeoJSON MultiPolygon as 2D little-endian WKB, for `ST_GeomFromWKB`. Cheaper to produce
 * and parse than GeoJSON text on both ends: no JSON tree walking or decimal-text number parsing,
 * and the payload itself is smaller (raw doubles instead of repeated JSON structure/keys and
 * decimal-text coordinates).
 */
export function multiPolygonToWkb(multiPolygon: MultiPolygon): Buffer {
  const polygons = multiPolygon.coordinates;

  let size = 1 + 4 + 4; // byte order + geometry type + polygon count
  for (const rings of polygons) {
    size += 1 + 4 + 4; // byte order + geometry type + ring count
    for (const ring of rings) {
      size += 4 + ring.length * 2 * DOUBLE_SIZE; // point count + (x, y) per point
    }
  }

  const buf = Buffer.allocUnsafe(size);
  let offset = 0;

  buf.writeUInt8(WKB_BYTE_ORDER_LE, offset);
  offset += 1;
  buf.writeUInt32LE(WKB_TYPE_MULTIPOLYGON, offset);
  offset += 4;
  buf.writeUInt32LE(polygons.length, offset);
  offset += 4;

  for (const rings of polygons) {
    buf.writeUInt8(WKB_BYTE_ORDER_LE, offset);
    offset += 1;
    buf.writeUInt32LE(WKB_TYPE_POLYGON, offset);
    offset += 4;
    buf.writeUInt32LE(rings.length, offset);
    offset += 4;

    for (const ring of rings) {
      buf.writeUInt32LE(ring.length, offset);
      offset += 4;
      for (const [x, y] of ring) {
        buf.writeDoubleLE(x!, offset);
        offset += DOUBLE_SIZE;
        buf.writeDoubleLE(y!, offset);
        offset += DOUBLE_SIZE;
      }
    }
  }

  return buf;
}
