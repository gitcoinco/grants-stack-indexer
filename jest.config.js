/** @type {import('ts-jest').JestConfigWithTsJest} */

export default {
  preset: "ts-jest/presets/js-with-ts",
  testEnvironment: "node",
  resolver: "ts-jest-resolver",
  transformIgnorePatterns: [`/node_modules/(?!(chainsauce))/`],
};
