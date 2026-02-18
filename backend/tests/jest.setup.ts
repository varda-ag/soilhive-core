import { startDockerCompose } from './helper';
import { setupTestEnv } from './environment';

module.exports = async () => {
  // Code to run before each test across all test files
  await startDockerCompose();
  setupTestEnv();
};
