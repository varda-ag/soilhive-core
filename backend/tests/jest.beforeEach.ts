import { beforeEach, jest } from '@jest/globals';
import inspector from 'inspector';
import { setupTestEnv } from './environment';
import { clearDatabase } from './helper';
import { resetEnabledRasterFilterTablesCache } from '../src/data-layer/SoilDataStorage';

if (inspector.url()) {
  jest.setTimeout(10 * 60 * 1000); // 10 minutes timeout when debugger is attached
}

beforeEach(async () => {
  // Code to run before each test across all test files
  await clearDatabase();
  // clearDatabase truncates raster_filters; drop the matching in-memory cache too so a
  // value cached while the table was empty does not leak into the next test.
  resetEnabledRasterFilterTablesCache();
  setupTestEnv();
});
