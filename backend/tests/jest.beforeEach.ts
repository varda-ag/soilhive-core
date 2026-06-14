import { beforeEach, jest } from '@jest/globals';
import inspector from 'inspector';
import { setupTestEnv } from './environment';
import { clearDatabase } from './helper';

if (inspector.url()) {
  jest.setTimeout(10 * 60 * 1000); // 10 minutes timeout when debugger is attached
}

beforeEach(async () => {
  // Code to run before each test across all test files
  await clearDatabase();
  setupTestEnv();
});
