/// <reference types="vitest" />
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [".var"],
    },
    watchExclude: [...configDefaults.watchExclude, ".var", "test"],
    exclude: [...configDefaults.exclude, ".var"],
  },
});
