import { getPrices, appendPrices } from "../prices.js";
import { parseArgs } from "node:util";
import { getPricesByHour } from "../coinGecko.js";
import getBlockFromTimestamp from "../getBlockFromTimestamp.js";
import { Cache } from "chainsauce";

import config from "../config.js";

const cache = new Cache(".cache");

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

    const currentPrices = await getPrices(chain.id);

    // get last updated price
    const lastPriceAt = currentPrices.reduce(
      (acc, price) => Math.max(price.timestamp + hours(1), acc),
      getPricesFrom
    );

    const now = new Date();

    // time elapsed from the last update, rounded to hours
    const timeElapsed =
      Math.floor((now.getTime() - lastPriceAt) / hours(1)) * hours(1);

    // only fetch new prices every new hour
    if (timeElapsed < hours(1)) {
      continue;
    }

    // get prices in 90 day chunks to get the most of Coingecko's granularity
    const timeChunks = chunkTimeBy(timeElapsed, days(90));

    for (const chunk of timeChunks) {
      for (const token of chain.tokens) {
        const cacheKey = `${chain.id}-${token.address}-${
          lastPriceAt + chunk[0]
        }-${lastPriceAt + chunk[1]}`;

        const prices = await cache.lazy(cacheKey, () =>
          getPricesByHour(
            token.address,
            chain.id,
            (lastPriceAt + chunk[0]) / 1000,
            (lastPriceAt + chunk[1]) / 1000
          )
        );

        const newPrices = await Promise.all(
          prices.map(async ([timestamp, price]) => {
            const block = await getBlockFromTimestamp(chainKey, timestamp);

            return {
              token: token.address.toLowerCase(),
              code: token.code,
              price,
              timestamp,
              block,
            };
          })
        );

        console.log("Fetched", newPrices.length, "new prices");

        await appendPrices(chain.id, newPrices);
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
