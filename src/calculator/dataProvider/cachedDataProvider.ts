import { DataProvider } from "./index.js";

interface CachedDataProviderOptions {
  dataProvider: DataProvider;
  cache: {
    set(key: string, value: unknown): void;
    get(key: string): unknown | undefined;
  };
}

export class CachedDataProvider implements DataProvider {
  cache: CachedDataProviderOptions["cache"];
  dataProvider: CachedDataProviderOptions["dataProvider"];

  constructor(options: CachedDataProviderOptions) {
    this.cache = options.cache;
    this.dataProvider = options.dataProvider;
  }

  async loadFile<T>(description: string, path: string): Promise<Array<T>> {
    const cacheKey = `data-provider:${path}`;
    const cachedValue = this.cache.get(cacheKey);

    if (cachedValue !== undefined) {
      return cachedValue as Array<T>;
    }

    const value = await this.dataProvider.loadFile<T>(description, path);
    this.cache.set(cacheKey, value);
    return value;
  }
}
