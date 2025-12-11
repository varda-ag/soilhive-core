import { setupTestEnv } from './environment';
import { clearDatabase } from './helper';

beforeEach(async () => {
  // Code to run before each test across all test files
  await clearDatabase();
  setupTestEnv();
});
