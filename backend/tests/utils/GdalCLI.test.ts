import { describe, it, expect } from '@jest/globals';
import { GdalCLI } from '../../src/utils/GdalCLI';

const GEOJSON_OGRINFO = JSON.stringify({
  description: '/path/to/sample_point_0.geojson',
  driverShortName: 'GeoJSON',
  driverLongName: 'GeoJSON',
  layers: [
    {
      name: 'sample_point_0',
      metadata: {},
      geometryFields: [
        {
          name: '',
          type: 'Point',
          nullable: true,
          extent: [37.6871, -3.79168, 39.7114, -0.637193],
          coordinateSystem: {
            wkt: 'GEOGCRS["WGS 84",...]',
            projjson: {
              $schema: 'https://proj.org/schemas/v0.7/projjson.schema.json',
              type: 'GeographicCRS',
              name: 'WGS 84',
              id: { authority: 'EPSG', code: 4326 },
            },
            dataAxisToSRSAxisMapping: [2, 1],
          },
        },
      ],
      featureCount: 8,
      fields: [
        { name: 'metadata', type: 'String', subType: 'JSON', nullable: true, uniqueConstraint: false },
        { name: 'rawParameters', type: 'String', subType: 'JSON', nullable: true, uniqueConstraint: false },
      ],
    },
  ],
  metadata: {},
  domains: {},
  relationships: {},
});

const parseOgrInfo = (json: string) => (GdalCLI as any).parseOgrInfo(json);

describe('GdalCLI.parseOgrInfo', () => {
  describe('GeoJSON with Point geometry', () => {
    it('extracts driver', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).driver).toBe('GeoJSON');
    });

    it('extracts geometry type from geometryFields[0].type', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].geometry).toBe('Point');
    });

    it('extracts EPSG from coordinateSystem.projjson.id', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].epsg).toBe(4326);
    });

    it('extracts feature count', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].featureCount).toBe(8);
    });

    it('extracts attribute fields', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].fields).toEqual([
        { name: 'metadata', type: 'String' },
        { name: 'rawParameters', type: 'String' },
      ]);
    });

    it('sets geomColumn to empty string for GeoJSON (unnamed geometry field)', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].geomColumn).toBe('');
    });
  });

  describe('layer with no geometry', () => {
    it('defaults geometry to None when geometryFields is absent', () => {
      const json = JSON.stringify({
        driverShortName: 'CSV',
        layers: [{ name: 'table', featureCount: 3, fields: [] }],
      });
      expect(parseOgrInfo(json).layers[0].geometry).toBe('None');
    });

    it('defaults epsg to undefined when coordinateSystem is absent', () => {
      const json = JSON.stringify({
        driverShortName: 'CSV',
        layers: [{ name: 'table', featureCount: 3, fields: [] }],
      });
      expect(parseOgrInfo(json).layers[0].epsg).toBeUndefined();
    });
  });
});
