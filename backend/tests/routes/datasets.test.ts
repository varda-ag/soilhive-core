import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';

describe('Testing /datasets routes', () => {
  it('GET /datasets responds with the list of all available datasets', async () => {
    const s1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['ph'] });
    const s2 = await addSyntheticData({ ...syntheticDataOptions, id: 2, soilPropertyNames: ['oc'] });
    const res = await request(app).get('/datasets');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    const ids = res.body.map((item: any) => item.id);
    expect(ids).toContain(s1.dataset.id);
    expect(ids).toContain(s2.dataset.id);
  });

  it('GET /datasets/:datasetSlug responds with the expected dataset', async () => {
    const s1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['ph'] });
    const res = await request(app).get(`/datasets/${s1.dataset.slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('slug', s1.dataset.slug);
  });

  it('GET /datasets responds with 404 if dataset does not exist', async () => {
    const res = await request(app).get(`/datasets/wrong`);
    expect(res.statusCode).toBe(404);
  });
});
