import request from 'supertest';
import { app } from '../../src/app';

describe('Testing /soil-data routes', () => {
  it('Getting soil data without required parameter should fail', async () => {
    const res = await request(app).get(`/soil-data`);
    expect(res.statusCode).toBe(400);
  });

  it('Getting soil data where there is none should return empty results', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(0);
  });
});
