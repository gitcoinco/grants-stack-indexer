export interface DataProvider {
  loadFile<T>(description: string, path: string): Promise<Array<T>>;
}
