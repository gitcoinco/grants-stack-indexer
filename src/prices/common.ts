import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "fs";

export type Price = {
  token: string;
  code: string;
  price: number;
  timestamp: number;
  block: number;
};

export async function readPricesFile(
  chainId: number,
  storageDir: string
): Promise<Price[]> {
  const filename = pricesFilename(chainId, storageDir);

  // XXX remove sync function
  if (existsSync(filename)) {
    return JSON.parse((await fs.readFile(filename)).toString()) as Price[];
  }

  return [];
}

export function pricesFilename(chainId: number, storageDir: string): string {
  return path.join(storageDir, `${chainId}/prices.json`);
}

export const minutes = (n: number) => n * 60 * 1000;
export const hours = (n: number) => minutes(60) * n;
export const days = (n: number) => hours(24) * n;
