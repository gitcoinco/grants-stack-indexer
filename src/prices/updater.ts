import path from "node:path";
import fs from "node:fs/promises";
import { Logger } from "pino";
import { ToBlock } from "chainsauce";
import { ethers } from "ethers";
import writeFileAtomic from "write-file-atomic";

import { getBlockFromTimestamp } from "../utils/getBlockFromTimestamp.js";
import { getPricesByHour } from "./coinGecko.js";
import { Chain } from "../config.js";
import {
  days,
  hours,
  Price,
  pricesFilename,
  readPricesFile,
} from "./common.js";

const POLL_INTERVAL_MS = 60 * 1000;

export interface PriceUpdaterService {
  start: (opts?: { watch: boolean; toBlock: ToBlock }) => Promise<void>;
}

interface PriceUpdaterConfig {
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  chain: Chain;
  storageDir: string;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  withCacheFn?: <T>(cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  logger: Logger;
}

export function createPriceUpdater(
  config: PriceUpdaterConfig
): PriceUpdaterService {
  const { logger } = config;
  const withCacheMaybe = config.withCacheFn ?? ((_cacheKey, fn) => fn());

  // PUBLIC

  async function start(
    opts: { watch: boolean; toBlock: ToBlock } = {
      watch: true,
      toBlock: "latest",
    }
  ) {
    logger.info("catching up");
    await update(opts.toBlock);

    if (opts.watch) {
      logger.info("begin polling for new prices");
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  }

  // INTERNALS

  const poll = async (): Promise<void> => {
    await update("latest");
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  async function update(toBlock: ToBlock) {
    try {
      const { rpcProvider: provider } = config;

      logger.debug({
        msg: `updating prices to block: ${toBlock}`,
        fromTimestamp: new Date(config.chain.pricesFromTimestamp),
      });
      const currentPrices = await readPricesFile(
        config.chain.id,
        config.storageDir
      );

      // get last updated price
      const lastPriceAt = currentPrices.reduce(
        (acc, price) => Math.max(price.timestamp + hours(1), acc),
        config.chain.pricesFromTimestamp
      );

      let toDate = undefined;

      if (toBlock === "latest") {
        toDate = new Date();
      } else {
        const block = await provider.getBlock(toBlock);
        toDate = new Date(block.timestamp * 1000);
      }

      // time elapsed from the last update, rounded to hours
      const timeElapsed =
        Math.floor((toDate.getTime() - lastPriceAt) / hours(1)) * hours(1);

      // only fetch new prices every new hour
      if (timeElapsed < hours(1)) {
        return;
      }

      const getBlockTimestamp = async (blockNumber: number) => {
        const block = await withCacheMaybe(
          `block-${config.chain.id}-${blockNumber}`,
          () => provider.getBlock(blockNumber)
        );

        return block.timestamp;
      };

      const lastBlockNumber = await provider.getBlockNumber();

      // get prices in 90 day chunks to get the most of Coingecko's granularity
      const timeChunks = chunkTimeBy(timeElapsed, days(90));

      for (const chunk of timeChunks) {
        for (const token of config.chain.tokens) {
          const cacheKey = `${config.chain.id}-${token.address}-${
            lastPriceAt + chunk[0]
          }-${lastPriceAt + chunk[1]}`;

          logger.debug(
            `fetching prices for ${token.code} from ${new Date(
              lastPriceAt + chunk[0]
            ).toISOString()} to ${new Date(
              lastPriceAt + chunk[1]
            ).toISOString()}`
          );

          const prices = await withCacheMaybe(cacheKey, () =>
            getPricesByHour(
              token,
              (lastPriceAt + chunk[0]) / 1000,
              (lastPriceAt + chunk[1]) / 1000,
              config
            )
          );

          const newPrices: Price[] = [];

          for (const [timestamp, price] of prices) {
            try {
              const blockNumber = await getBlockFromTimestamp(
                timestamp,
                0,
                lastBlockNumber,
                getBlockTimestamp,
                logger
              );

              newPrices.push({
                token: token.address.toLowerCase(),
                code: token.code,
                price,
                timestamp,
                block: blockNumber,
              });
            } catch (err) {
              throw new Error(
                `Error getting block number for token ${token.code} at timestamp ${timestamp}`,
                { cause: err }
              );
            }
          }

          logger.debug(`fetched ${newPrices.length} prices`);

          await appendPrices(config.chain.id, newPrices);
        }
      }
    } catch (err) {
      logger.error({ msg: "error updating prices", err });
    }
  }

  async function appendPrices(chainId: number, newPrices: Price[]) {
    const currentPrices = await readPricesFile(chainId, config.storageDir);
    await writePrices(chainId, currentPrices.concat(newPrices));
  }

  async function writePrices(chainId: number, prices: Price[]) {
    return writePricesFile(pricesFilename(chainId, config.storageDir), prices);
  }

  async function writePricesFile(filename: string, prices: Price[]) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await writeFileAtomic(filename, JSON.stringify(prices));
  }

  // API

  return { start };
}

// UTILITIES

function chunkTimeBy(millis: number, chunkBy: number): [number, number][] {
  const chunks: [number, number][] = [];

  for (let i = 0; i < millis; i += chunkBy) {
    const chunkEndTime = Math.min(i + chunkBy, millis);
    chunks.push([i, chunkEndTime]);
  }

  return chunks;
}
