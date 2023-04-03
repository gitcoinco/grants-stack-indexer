import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { getPricesByHour } from "../coinGecko.js";
import getBlockFromTimestamp from "../getBlockFromTimestamp.js";

import config from "../config.js";

const getPricesFrom = new Date(Date.UTC(2023, 0, 1, 0, 0, 0)).getTime();

const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => minutes(60) * n;
const days = (n: number) => hours(24) * n;

const { values } = parseArgs({
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
  },
});

export type Price = {
  chainId: number;
  token: string;
  code: string;
  price: number;
  from: number;
  to: number;
  block: number;
};

async function readPrices(filename: string): Promise<Price[]> {
  let currentPrices;

  try {
    currentPrices = JSON.parse((await fs.readFile(filename)).toString());
  } catch {
    currentPrices = [];
  }

  return currentPrices;
}

async function writePrices(filename: string, prices: Price[]) {
  const tempFile = `${filename}.write`;
  await fs.writeFile(tempFile, JSON.stringify(prices));
  await fs.rename(tempFile, filename);
}

async function appendPrices(filename: string, newPrices: Price[]) {
  const currentPrices = await readPrices(filename);
  await writePrices(filename, currentPrices.concat(newPrices));
}

function chunkTimeBy(millis: number, chunkBy: number): [number, number][] {
  const chunks: [number, number][] = [];

  for (let i = 0; i < millis; i += chunkBy) {
    const chunkEndTime = Math.min(i + chunkBy, millis);
    chunks.push([i, chunkEndTime]);
  }

  return chunks;
}

async function updatePricesAndWrite() {
  for (const chainKey in config.chains) {
    const chain = config.chains[chainKey];

    const filename = path.join(config.storageDir, `${chain.id}/prices.json`);
    await fs.mkdir(path.dirname(filename), { recursive: true });

    const currentPrices = await readPrices(filename);

    // get last updated price
    const lastPriceAt = currentPrices.reduce(
      (acc, price) => Math.max(price.to, acc),
      getPricesFrom
    );

    const now = new Date();

    // time elapsed from the last update, rounded to hours
    const timeElapsed =
      Math.floor((now.getTime() - lastPriceAt) / hours(1)) * hours(1);

    // only fetch new prices every new hour
    if (timeElapsed < hours(1)) {
      return;
    }

    // get prices in 90 day chunks to get the most of Coingecko's granularity
    const timeChunks = chunkTimeBy(timeElapsed, days(90));

    for (const chunk of timeChunks) {
      for (const token of chain.tokens) {
        const prices = await getPricesByHour(
          token.address,
          chain.id,
          (lastPriceAt + chunk[0]) / 1000,
          (lastPriceAt + chunk[1]) / 1000
        );

        const newPrices = await Promise.all(
          prices.map(async ([timestamp, price]) => {
            const block = await getBlockFromTimestamp(chainKey, timestamp);

            return {
              chainId: chain.id,
              token: token.address.toLowerCase(),
              code: token.code,
              price,
              from: timestamp,
              to: timestamp + hours(1),
              block,
            };
          })
        );

        console.log("Fetched", newPrices.length, "new prices");

        appendPrices(filename, newPrices);
      }
    }
  }
}

async function loop() {
  await updatePricesAndWrite();

  setTimeout(loop, minutes(1));
}

if (values.follow) {
  await loop();
} else {
  await updatePricesAndWrite();
}
