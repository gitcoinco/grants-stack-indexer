/// <reference types="vitest" />
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watchExclude: [
      ...configDefaults.watchExclude,
      "data",
      ".cache",
      "test",
      "passport_scores.leveldb",
    ],
  },
});
