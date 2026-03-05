import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import {
  addSyntheticData,
  syntheticDataOptions,
  addSyntheticIngestionData,
  syntheticIngestionDataOptions,
  getLoadedDataCount,
} from '../../src/utils/mock';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addLandCoverData, addLandCoverMappings, getDataAdminToken } from '../helper';
import { StatusCodes } from 'http-status-codes';
import * as RasterUtilsModule from '../../src/utils/raster';

describe('Testing /soil-data routes', () => {
  it('Getting soil data without required parameter should fail', async () => {
    const res = await request(app).get(`/soil-data`);
    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(res.body.detail).toContain("must have required property 'datasets'");
  });

  it('Getting soil data where there is none should return empty results', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', limit: 100 });
    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.body.length).toBe(0);
  });

  it('Validation of cursor parameter is working', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', limit: 100, cursor: 'invalid-cursor' });
    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(res.body.detail).toContain('Cursor decoding failure');
  });

  it('Validation of sort parameter is working', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', sort: 'wrong-field' });
    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(res.body.detail).toContain('sort must be equal to one of the allowed values');
  });

  it('Invalid filter UUID should trigger 400 error', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', filterId: 'invalid-filter-id' });
    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(res.body.detail).toContain('must match format "uuid"');
  });

  it('Unexistent filter id should trigger 404 error', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', filterId: '42f4c2bf-e678-42b8-8e7c-95fd110645a3' });
    expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(res.body.detail).toContain('not found');
  });

  it.each([
    ['Point', {}, false],
    ['Polygon', {}, false],
    ['Point', { raster_filters: { land_cover: [200] } }, false],
    ['Polygon', { raster_filters: { land_cover: [200] } }, false],
    ['Point', {}, false],
    ['Polygon', {}, false],
    ['Point', { raster_filters: { land_cover: [200] } }, true],
    ['Polygon', { raster_filters: { land_cover: [200] } }, true],
  ])(
    'Should retrieve data when searching inside spatial extent',
    async (featureGeometryType, parameters, addRasterData) => {
      const bbox = [-91, -31, -90, -30]; // This overlaps test land cover
      const { dataset } = await addSyntheticData({
        ...syntheticDataOptions,
        spatial_extent: bbox,
        id: 1001,
        soilPropertyNames: ['ph_test'],
        featureCount: 5,
        featureGeometryType,
      });

      if (addRasterData) {
        await addLandCoverData();
        await addLandCoverMappings();
        // Do not reference any overview (they don't exist in test dump)
        jest.spyOn(RasterUtilsModule, 'selectOverviewTable').mockReturnValue('land_cover');
      }

      // Create a data filter with geometry inside the extent
      const filterId = await createFilter(bbox, parameters);

      // Call soil-data endpoint
      const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100`);
      expect(soilDataRes.statusCode).toBe(StatusCodes.OK);
      expect(soilDataRes.body.length).toBeGreaterThan(0); // Should have data
    },
    20000,
  );

  it('Should return zero data when searching outside spatial extent', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1002,
      soilPropertyNames: ['oc_test'],
      featureCount: 5,
    });

    // Create a data filter with geometry outside the extent
    const filterId = await createFilter([20, 20, 30, 30]);

    // Call soil-data endpoint
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100`);
    expect(soilDataRes.statusCode).toBe(StatusCodes.OK);
    expect(soilDataRes.body.length).toBe(0); // Should have no data
  });

  it('Should retrieve data from multiple geometries', async () => {
    // Create synthetic data in two separate areas
    const data1 = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 5, 5],
      id: 1003,
      soilPropertyNames: ['multi1'],
      featureCount: 10,
    });
    const data2 = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [10, 10, 15, 15],
      id: 1004,
      soilPropertyNames: ['multi2'],
      featureCount: 10,
    });

    // Create a data filter with geometries covering both areas
    const filterPayload = {
      parameters: {},
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [5, 0],
              [5, 5],
              [0, 5],
              [0, 0],
            ],
          ],
        },
        {
          type: 'Polygon',
          coordinates: [
            [
              [10, 10],
              [15, 10],
              [15, 15],
              [10, 15],
              [10, 10],
            ],
          ],
        },
      ],
    };
    const filterRes = await request(app).post('/data-filters').send(filterPayload);
    expect(filterRes.statusCode).toBe(StatusCodes.CREATED);
    const filterId = filterRes.body.id;

    // Call soil-data endpoint with both datasets
    const datasets = `${data1.dataset.slug},${data2.dataset.slug}`;
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${datasets}&limit=100`);
    expect(soilDataRes.statusCode).toBe(StatusCodes.OK);
    expect(soilDataRes.body.length).toBeGreaterThan(0); // Should have data from both areas
    // Verify data contains entries from both soil properties
    const soilProperties = soilDataRes.body.map((item: any) => item.soil_property);
    expect(soilProperties).toContain('multi1');
    expect(soilProperties).toContain('multi2');
    // Verify data contains entries from both datasets
    const datasetIds = soilDataRes.body.map((item: any) => item.dataset_id);
    expect(datasetIds).toContain(data1.dataset.slug);
    expect(datasetIds).toContain(data2.dataset.slug);
  });

  it('Should sort data in ascending and descending order', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1005,
      soilPropertyNames: ['sort_test'],
      featureCount: 5,
    });

    // Create a data filter covering the entire extent
    const filterId = await createFilter([0, 0, 10, 10]);

    // Get data sorted by value ascending
    const ascRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=value`);
    expect(ascRes.statusCode).toBe(StatusCodes.OK);
    expect(ascRes.body.length).toBeGreaterThan(1);

    // Get data sorted by value descending
    const descRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-value`);
    expect(descRes.statusCode).toBe(StatusCodes.OK);
    expect(descRes.body.length).toBe(ascRes.body.length);

    // Verify that the values are in reverse order
    const ascValues = ascRes.body.map((item: any) => item.value);
    const descValues = descRes.body.map((item: any) => item.value);
    expect(descValues).toEqual(ascValues.reverse());
  });

  it('Should respect limit parameter for pagination', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1006,
      soilPropertyNames: ['limit_test'],
      featureCount: 10, // Create 10 features to ensure we have enough data
    });

    // Create a data filter covering the entire extent
    const filterId = await createFilter([0, 0, 10, 10]);

    // Get data with limit of 3
    const limitedRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3`);
    expect(limitedRes.statusCode).toBe(StatusCodes.OK);
    expect(limitedRes.body.length).toBe(3);

    // Get data with limit of 5
    const limitedRes2 = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=5`);
    expect(limitedRes2.statusCode).toBe(StatusCodes.OK);
    expect(limitedRes2.body.length).toBe(5);

    // Get data with no limit (should default to some reasonable number)
    const unlimitedRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}`);
    expect(unlimitedRes.statusCode).toBe(StatusCodes.OK);
    expect(unlimitedRes.body.length).toBeGreaterThan(0);
  });

  it('Should support cursor-based pagination', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1007,
      soilPropertyNames: ['cursor_test'],
      featureCount: 8,
    });

    // Create a data filter covering the entire extent
    const filterId = await createFilter([0, 0, 10, 10]);

    // Get first page with limit 3
    const firstPageRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3`);
    expect(firstPageRes.statusCode).toBe(StatusCodes.OK);
    expect(firstPageRes.body.length).toBe(3);
    const firstPageIds = firstPageRes.body.map((item: any) => item.id || item.value);

    // Get second page using cursor from last item of first page
    const lastItemCursor = firstPageRes.body[firstPageRes.body.length - 1].cursor;
    const secondPageRes = await request(app).get(
      `/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&cursor=${lastItemCursor}`,
    );
    expect(secondPageRes.statusCode).toBe(StatusCodes.OK);
    expect(secondPageRes.body.length).toBe(3);
    const secondPageIds = secondPageRes.body.map((item: any) => item.id);

    // Verify no overlap between pages
    const overlap = firstPageIds.filter((id: any) => secondPageIds.includes(id));
    expect(overlap.length).toBe(0);

    // Get third page
    const lastItemCursor2 = secondPageRes.body[secondPageRes.body.length - 1].cursor;
    const thirdPageRes = await request(app).get(
      `/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&cursor=${lastItemCursor2}`,
    );
    expect(thirdPageRes.statusCode).toBe(StatusCodes.OK);
    expect(thirdPageRes.body.length).toBe(2); // Should have remaining 2 items
  });

  it('Should sort by different fields correctly', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1008,
      soilPropertyNames: ['sort_field_test'],
      featureCount: 5,
    });

    // Create a data filter covering the entire extent
    const filterId = await createFilter([0, 0, 10, 10]);

    // Test sorting by dataset (should be consistent since all same dataset)
    const datasetAscRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=dataset_id`);
    expect(datasetAscRes.statusCode).toBe(StatusCodes.OK);
    expect(datasetAscRes.body.length).toBeGreaterThan(0);

    const datasetDescRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-dataset_id`);
    expect(datasetDescRes.statusCode).toBe(StatusCodes.OK);
    expect(datasetDescRes.body.length).toBe(datasetAscRes.body.length);

    // Test sorting by soil_property
    const propertyAscRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=soil_property`);
    expect(propertyAscRes.statusCode).toBe(StatusCodes.OK);

    const propertyDescRes = await request(app).get(
      `/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-soil_property`,
    );
    expect(propertyDescRes.statusCode).toBe(StatusCodes.OK);
  });

  it('Should combine pagination and sorting correctly', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1009,
      soilPropertyNames: ['combined_test'],
      featureCount: 7,
    });

    // Create a data filter covering the entire extent
    const filterId = await createFilter([0, 0, 10, 10]);

    // Get all data sorted by value ascending to establish baseline
    const allDataAsc = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=value`);
    expect(allDataAsc.statusCode).toBe(StatusCodes.OK);
    expect(allDataAsc.body.length).toBe(7);

    // Get first 3 items with ascending sort
    const firstPageAsc = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&sort=value`);
    expect(firstPageAsc.statusCode).toBe(StatusCodes.OK);
    expect(firstPageAsc.body.length).toBe(3);

    // Verify first page items are in ascending order
    const firstPageValues = firstPageAsc.body.map((item: any) => item.value);
    for (let i = 1; i < firstPageValues.length; i++) {
      expect(firstPageValues[i]).toBeGreaterThanOrEqual(firstPageValues[i - 1]);
    }

    // Get next page with cursor
    const lastItemCursor = firstPageAsc.body[2].cursor;
    const secondPageAsc = await request(app).get(
      `/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&cursor=${lastItemCursor}&sort=value`,
    );
    expect(secondPageAsc.statusCode).toBe(StatusCodes.OK);
    expect(secondPageAsc.body.length).toBeGreaterThan(0); // Should have remaining items

    // Verify second page items are also in ascending order
    const secondPageValues = secondPageAsc.body.map((item: any) => item.value);
    for (let i = 1; i < secondPageValues.length; i++) {
      expect(secondPageValues[i]).toBeGreaterThanOrEqual(secondPageValues[i - 1]);
    }

    // Test descending sort with pagination
    const firstPageDesc = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&sort=-value`);
    expect(firstPageDesc.statusCode).toBe(StatusCodes.OK);
    expect(firstPageDesc.body.length).toBe(3);

    // Verify first page items are in descending order
    const firstPageDescValues = firstPageDesc.body.map((item: any) => item.value);
    for (let i = 1; i < firstPageDescValues.length; i++) {
      expect(firstPageDescValues[i]).toBeLessThanOrEqual(firstPageDescValues[i - 1]);
    }
  });

  it('Should retrieve data using property filtering', async () => {
    const data1 = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 5, 5],
      id: 1003,
      soilPropertyNames: ['prop1'],
      featureCount: 5,
    });
    const data2 = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [10, 10, 15, 15],
      id: 1004,
      soilPropertyNames: ['prop2'],
      featureCount: 5,
    });

    // Create a data filter covering the entire extent selecting only 'prop1'
    const filterId = await createFilter([0, 0, 20, 20], { soil_properties: ['prop1'] });

    // Call soil-data endpoint with both datasets
    const datasets = `${data1.dataset.slug},${data2.dataset.slug}`;
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${datasets}`);
    expect(soilDataRes.statusCode).toBe(StatusCodes.OK);
    expect(soilDataRes.body.length).toBe(5);
    // Verify data contains entries only for soil property 'prop1'
    const soilProperties = soilDataRes.body.map((item: any) => item.soil_property);
    expect(soilProperties).toContain('prop1');
    expect(soilProperties).not.toContain('prop2');
    // Verify data contains entries from only dataset1
    const datasetIds = soilDataRes.body.map((item: any) => item.dataset_id);
    expect(datasetIds).toContain(data1.dataset.slug);
    expect(datasetIds).not.toContain(data2.dataset.slug);
  });

  it.each([
    [null, null],
    ['2020-01-01', '2020-01-01'],
    ['2020-01-01T00:00:05Z', '2020-01-01'],
  ])('Should load data', async (sampling_date, expected_sampling_date) => {
    const { dataset, datasetFileMapping } = await addSyntheticIngestionData({
      ...syntheticIngestionDataOptions,
      createTable: false,
    });
    const token = await getDataAdminToken();
    const payload = [
      {
        sampling_date,
        license: 'test_license_raw_data',
        horizon: null,
        max_depth: 30,
        min_depth: 0,
        bdfi33: '2',
        bdfiod: '8',
        geometry: { type: 'Point', coordinates: [-148.0432434, 64.814888] },
      },
    ];

    // Call soil-data endpoint
    const soilDataRes = await request(app)
      .post(`/datasets/${dataset.slug}/dataset-file-mapping/${datasetFileMapping.id}/soil-data`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(soilDataRes.statusCode).toBe(StatusCodes.CREATED);
    // Verify that one feature (one geom), one layer (one combination of date/license/min and max depth/horizon),
    // two dataset layers (two combinations of feature/layer/soil property), and two observations (two combinations of soil property/procedure) have been created.
    const createdData = await getLoadedDataCount();
    expect(createdData.n_features).toBe(1);
    expect(createdData.n_layers).toBe(1);
    expect(createdData.n_dataset_layers).toBe(2);
    expect(createdData.n_observations).toBe(2);
    // Verify sampling date
    const dataResponse = await request(app).get(`/soil-data`).query({ datasets: dataset.slug });
    const data = dataResponse.body;
    expect(data.length).toBe(2);
    for (const item of data) {
      expect(item.sampling_date).toBe(expected_sampling_date);
    }
  });
});

const createFilter = async (spatial_extent: number[], parameters = {}): Promise<string> => {
  const polygon = getPolygonFromBbox(spatial_extent);
  // Create a data filter covering the entire extent
  const filterPayload = {
    parameters,
    geometries: [polygon],
  };
  const filterRes = await request(app).post('/data-filters').send(filterPayload);
  expect(filterRes.statusCode).toBe(StatusCodes.CREATED);
  return filterRes.body.id;
};
