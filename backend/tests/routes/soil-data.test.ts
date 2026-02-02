import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, syntheticDataOptions, addSyntheticIngestionData, syntheticIngestionDataOptions } from '../../src/utils/mock';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { getDataAdminToken } from '../helper';

describe('Testing /soil-data routes', () => {
  it('Getting soil data without required parameter should fail', async () => {
    const res = await request(app).get(`/soil-data`);
    console.log(res.body.detail);
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("must have required property 'datasets'");
  });

  it('Getting soil data where there is none should return empty results', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', limit: 100 });
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('Validation of cursor parameter is working', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', limit: 100, cursor: 'invalid-cursor' });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain('Cursor decoding failure');
  });

  it('Validation of sort parameter is working', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', sort: 'wrong-field' });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain('sort must be equal to one of the allowed values');
  });

  it('Invalid filter UUID should trigger 400 error', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', filterId: 'invalid-filter-id' });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain('must match format "uuid"');
  });

  it('Unexistent filter id should trigger 404 error', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', filterId: '42f4c2bf-e678-42b8-8e7c-95fd110645a3' });
    expect(res.statusCode).toBe(404);
    expect(res.body.detail).toContain('not found');
  });

  it('Should retrieve data when searching inside spatial extent', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1001,
      soilPropertyNames: ['ph_test'],
      featureCount: 5,
    });

    // Create a data filter with geometry inside the extent
    const filterId = await createFilter([0, 0, 10, 10]);

    // Call soil-data endpoint
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100`);
    expect(soilDataRes.statusCode).toBe(200);
    expect(soilDataRes.body.length).toBeGreaterThan(0); // Should have data
  });

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
    expect(soilDataRes.statusCode).toBe(200);
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
              [1, 1],
              [4, 1],
              [4, 4],
              [1, 4],
              [1, 1],
            ],
          ],
        },
        {
          type: 'Polygon',
          coordinates: [
            [
              [11, 11],
              [14, 11],
              [14, 14],
              [11, 14],
              [11, 11],
            ],
          ],
        },
      ],
    };
    const filterRes = await request(app).post('/data-filters').send(filterPayload);
    expect(filterRes.statusCode).toBe(201);
    const filterId = filterRes.body.id;

    // Call soil-data endpoint with both datasets
    const datasets = `${data1.dataset.slug},${data2.dataset.slug}`;
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${datasets}&limit=100`);
    expect(soilDataRes.statusCode).toBe(200);
    expect(soilDataRes.body.length).toBeGreaterThan(0); // Should have data from both areas
    // Verify data contains entries from both soil properties
    const soilProperties = soilDataRes.body.map((item: any) => item.soil_property);
    expect(soilProperties).toContain('multi1');
    expect(soilProperties).toContain('multi2');
    // Verify data contains entries from both datasets
    const datasetSlugs = soilDataRes.body.map((item: any) => item.dataset);
    expect(datasetSlugs).toContain(data1.dataset.slug);
    expect(datasetSlugs).toContain(data2.dataset.slug);
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
    expect(ascRes.statusCode).toBe(200);
    expect(ascRes.body.length).toBeGreaterThan(1);

    // Get data sorted by value descending
    const descRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-value`);
    expect(descRes.statusCode).toBe(200);
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
    expect(limitedRes.statusCode).toBe(200);
    expect(limitedRes.body.length).toBe(3);

    // Get data with limit of 5
    const limitedRes2 = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=5`);
    expect(limitedRes2.statusCode).toBe(200);
    expect(limitedRes2.body.length).toBe(5);

    // Get data with no limit (should default to some reasonable number)
    const unlimitedRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}`);
    expect(unlimitedRes.statusCode).toBe(200);
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
    expect(firstPageRes.statusCode).toBe(200);
    expect(firstPageRes.body.length).toBe(3);
    const firstPageIds = firstPageRes.body.map((item: any) => item.id || item.value);

    // Get second page using cursor from last item of first page
    const lastItemCursor = firstPageRes.body[firstPageRes.body.length - 1].cursor;
    const secondPageRes = await request(app).get(
      `/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&cursor=${lastItemCursor}`,
    );
    expect(secondPageRes.statusCode).toBe(200);
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
    expect(thirdPageRes.statusCode).toBe(200);
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
    const datasetAscRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=dataset`);
    expect(datasetAscRes.statusCode).toBe(200);
    expect(datasetAscRes.body.length).toBeGreaterThan(0);

    const datasetDescRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-dataset`);
    expect(datasetDescRes.statusCode).toBe(200);
    expect(datasetDescRes.body.length).toBe(datasetAscRes.body.length);

    // Test sorting by soil_property
    const propertyAscRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=soil_property`);
    expect(propertyAscRes.statusCode).toBe(200);

    const propertyDescRes = await request(app).get(
      `/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-soil_property`,
    );
    expect(propertyDescRes.statusCode).toBe(200);
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
    expect(allDataAsc.statusCode).toBe(200);
    expect(allDataAsc.body.length).toBe(7);

    // Get first 3 items with ascending sort
    const firstPageAsc = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&sort=value`);
    expect(firstPageAsc.statusCode).toBe(200);
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
    expect(secondPageAsc.statusCode).toBe(200);
    expect(secondPageAsc.body.length).toBeGreaterThan(0); // Should have remaining items

    // Verify second page items are also in ascending order
    const secondPageValues = secondPageAsc.body.map((item: any) => item.value);
    for (let i = 1; i < secondPageValues.length; i++) {
      expect(secondPageValues[i]).toBeGreaterThanOrEqual(secondPageValues[i - 1]);
    }

    // Test descending sort with pagination
    const firstPageDesc = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=3&sort=-value`);
    expect(firstPageDesc.statusCode).toBe(200);
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
    expect(soilDataRes.statusCode).toBe(200);
    expect(soilDataRes.body.length).toBe(5);
    // Verify data contains entries only for soil property 'prop1'
    const soilProperties = soilDataRes.body.map((item: any) => item.soil_property);
    expect(soilProperties).toContain('prop1');
    expect(soilProperties).not.toContain('prop2');
    // Verify data contains entries from only dataset1
    const datasetSlugs = soilDataRes.body.map((item: any) => item.dataset);
    expect(datasetSlugs).toContain(data1.dataset.slug);
    expect(datasetSlugs).not.toContain(data2.dataset.slug);
  });

  it('Should load data', async () => {
    const { dataset, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const token = await getDataAdminToken();
    const payload = {
      record_id: 10001,
      sampling_date: null,
      license: 'test_license_raw_data',
      horizon: null,
      max_depth: 30,
      min_depth: 0,
      bdfi33: '2',
      bdfiod: '8',
      geometry: { type: 'Point', coordinates: [-148.0432434, 64.814888] },
    };

    // Call soil-data endpoint
    const soilDataRes = await request(app)
      .post(`/soil-data?dataMappingId=${dataMapping.id}&datasetSlug=${dataset.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(soilDataRes.statusCode).toBe(201);
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
  expect(filterRes.statusCode).toBe(201);
  return filterRes.body.id;
};
