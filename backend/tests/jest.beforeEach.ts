import inspector from 'inspector';
import { setupTestEnv } from './environment';
import { clearDatabase } from './helper';

beforeEach(async () => {
  // Code to run before each test across all test files
  await clearDatabase();
  setupTestEnv();
  if (inspector.url()) {
    jest.setTimeout(10 * 60 * 1000); // 10 minutes timeout when debugger is attached
  }
});
