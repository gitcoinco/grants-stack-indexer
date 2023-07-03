import fs from "node:fs/promises";
import path from "node:path";

import { existsSync } from "fs";

import type { Price } from "./index.js";

function pricesFilename(storageDir: string, chainId: number): string {
  return path.join(storageDir, `${chainId}/prices.json`);
}

export async function readPrices(
  storageDir: string,
  chainId: number
): Promise<Price[]> {
  const filename = pricesFilename(storageDir, chainId);

  if (existsSync(filename)) {
    return JSON.parse((await fs.readFile(filename)).toString()) as Price[];
  }

  return [];
}

export async function writePrices(
  storageDir: string,
  chainId: number,
  prices: Price[]
) {
  const filename = pricesFilename(storageDir, chainId);
  const tempFile = `${filename}.write`;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(prices));
  await fs.rename(tempFile, filename);
}
