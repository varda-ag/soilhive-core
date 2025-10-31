import { setupTestData, startDockerCompose, teardown } from "./helper";

module.exports = async () => {
  // Code to run before each test across all test files
  await startDockerCompose();
};
