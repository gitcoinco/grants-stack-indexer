import fs from "node:fs/promises";
import path from "node:path";

import { existsSync } from "fs";

import type { Price } from "./index.js";

function pricesFilename(storageDir: string): string {
  return path.join(storageDir, `/prices.json`);
}

export async function readPrices(storageDir: string): Promise<Price[]> {
  const filename = pricesFilename(storageDir);

  if (existsSync(filename)) {
    return JSON.parse((await fs.readFile(filename)).toString()) as Price[];
  }

  return [];
}

export async function writePrices(storageDir: string, prices: Price[]) {
  const filename = pricesFilename(storageDir);
  const tempFile = `${filename}.write`;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(prices));
  await fs.rename(tempFile, filename);
}
