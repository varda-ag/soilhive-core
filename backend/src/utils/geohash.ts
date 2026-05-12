const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const geohashEncode = (lat: number, lon: number, precision: number): string => {
  let idx = 0,
    bit = 0,
    even = true,
    result = '';
  let latMin = -90,
    latMax = 90,
    lonMin = -180,
    lonMax = 180;

  while (result.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        idx = (idx << 1) | 1;
        lonMin = mid;
      } else {
        idx <<= 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = (idx << 1) | 1;
        latMin = mid;
      } else {
        idx <<= 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      result += BASE32[idx] ?? '';
      bit = 0;
      idx = 0;
    }
  }
  return result;
};

export const geohashDecodeBbox = (hash: string): [number, number, number, number] => {
  let even = true;
  let latMin = -90,
    latMax = 90,
    lonMin = -180,
    lonMax = 180;

  for (const ch of hash) {
    const val = BASE32.indexOf(ch);
    for (let bit = 4; bit >= 0; bit--) {
      if (even) {
        const mid = (lonMin + lonMax) / 2;
        if ((val >> bit) & 1) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if ((val >> bit) & 1) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return [latMin, lonMin, latMax, lonMax];
};

// Cell size in degrees for a given precision level.
const cellDimensions = (precision: number): { latStep: number; lonStep: number } => {
  const totalBits = precision * 5;
  const lonBits = Math.ceil(totalBits / 2);
  const latBits = Math.floor(totalBits / 2);
  return {
    latStep: 180 / Math.pow(2, latBits),
    lonStep: 360 / Math.pow(2, lonBits),
  };
};

// Returns all geohash cells at the given precision that cover the bbox [minLat,minLon,maxLat,maxLon].
export const geohashBboxes = (minLat: number, minLon: number, maxLat: number, maxLon: number, precision: number): string[] => {
  const { latStep, lonStep } = cellDimensions(precision);
  const result: string[] = [];

  // Snap SW corner to the cell-aligned grid origin
  const startLat = -90 + Math.floor((minLat + 90) / latStep) * latStep;
  const startLon = -180 + Math.floor((minLon + 180) / lonStep) * lonStep;

  for (let lat = startLat; lat < maxLat; lat += latStep) {
    for (let lon = startLon; lon < maxLon; lon += lonStep) {
      result.push(geohashEncode(Math.min(lat + latStep / 2, 89.9999), Math.min(lon + lonStep / 2, 179.9999), precision));
    }
  }
  return result;
};
