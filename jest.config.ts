/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type { Config } from "jest";

const config: Config = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",
  // A preset that is used as a base for Jest's configuration  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  // preset: "ts-jest/presets/default-esm",
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  // The test environment that will be used for testing
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  // The paths to modules that run some code to configure or set up the testing environment before each test
  // setupFiles: ["<rootDir>/src/__tests__/setup.ts"],
  // The glob patterns Jest uses to detect test files
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.spec.ts"],
  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ["node_modules", "setup.ts"],
  // A path to a module which exports an async function that is triggered once before all test suites
  globalSetup: "<rootDir>/src/__tests__/setup.ts",
  // A path to a module which exports an async function that is triggered once after all test suites
  globalTeardown: "<rootDir>/src/__tests__/teardown.ts",
};

export default config;
