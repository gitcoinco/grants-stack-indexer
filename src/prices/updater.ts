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
import { BlockCache } from "../blockCache.js";
import { createSqliteBlockCache } from "../blockCache/sqlite.js";

const POLL_INTERVAL_MS = 60 * 1000;

export interface PriceUpdaterService {
  start: (opts?: { watch: boolean; toBlock: ToBlock }) => Promise<void>;
  stop: () => void;
}

interface PriceUpdaterConfig {
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  chain: Chain;
  chainDataDir: string;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  blockCachePath?: string;
  withCacheFn?: <T>(cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  logger: Logger;
}

export function createPriceUpdater(
  config: PriceUpdaterConfig
): PriceUpdaterService {
  const {
    logger,
    chain: { id: chainId },
  } = config;
  const withCacheMaybe = config.withCacheFn ?? ((_cacheKey, fn) => fn());
  let pollTimeoutId: NodeJS.Timeout | null = null;
  let blockCache: BlockCache | null = null;

  // PUBLIC

  async function start(
    opts: { watch: boolean; toBlock: ToBlock } = {
      watch: true,
      toBlock: "latest",
    }
  ) {
    logger.info("catching up");

    if (!blockCache && config.blockCachePath) {
      blockCache = createSqliteBlockCache({
        dbPath: config.blockCachePath,
      });
    }

    await update(opts.toBlock);

    if (opts.watch) {
      logger.info("begin polling for new prices");
      pollTimeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }

  function stop() {
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
    }
  }

  // INTERNALS

  const poll = async (): Promise<void> => {
    await update("latest");
    pollTimeoutId = setTimeout(poll, POLL_INTERVAL_MS);
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
        config.chainDataDir
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

      const getBlockTimestamp = async (blockNumber: bigint) => {
        if (blockCache) {
          const timestamp = await blockCache.getTimestampByBlockNumber(
            chainId,
            blockNumber
          );

          if (timestamp) {
            return timestamp;
          }
        }

        const providerBlock = await provider.getBlock(Number(blockNumber));

        if (blockCache) {
          await blockCache.saveBlock({
            chainId,
            blockNumber,
            timestampInSecs: providerBlock.timestamp,
          });
        }

        return providerBlock.timestamp;
      };

      const timestampToBlockMap = new Map<number, bigint>();

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

          for (const [timestampMs, price] of prices) {
            try {
              const timestampInSeconds = Math.floor(timestampMs / 1000);

              let blockNumber =
                timestampToBlockMap.get(timestampInSeconds) ?? null;

              if (blockNumber === null) {
                let startBlock = 0n;
                let endBlock = BigInt(lastBlockNumber);

                if (blockCache) {
                  const { before: lowerBound, after: upperBound } =
                    await blockCache.getClosestBoundsForTimestamp(
                      chainId,
                      timestampInSeconds
                    );

                  if (lowerBound) {
                    startBlock = lowerBound.blockNumber;
                  }

                  if (upperBound) {
                    endBlock = upperBound.blockNumber;
                  }
                }

                blockNumber = await getBlockFromTimestamp({
                  timestampInSeconds,
                  startBlock,
                  endBlock,
                  getBlockTimestamp,
                });

                if (blockNumber === null) {
                  throw new Error(
                    `Could not find block for timestamp ${timestampMs}`
                  );
                }

                timestampToBlockMap.set(timestampInSeconds, blockNumber);
              }

              newPrices.push({
                token: token.address.toLowerCase(),
                code: token.code,
                price,
                timestamp: timestampMs,
                block: Number(blockNumber),
              });
            } catch (err) {
              throw new Error(
                `Error getting block number for token ${token.code} at timestamp ${timestampMs}`,
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
    const currentPrices = await readPricesFile(chainId, config.chainDataDir);
    await writePrices(chainId, currentPrices.concat(newPrices));
  }

  async function writePrices(chainId: number, prices: Price[]) {
    return writePricesFile(
      pricesFilename(chainId, config.chainDataDir),
      prices
    );
  }

  async function writePricesFile(filename: string, prices: Price[]) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await writeFileAtomic(filename, JSON.stringify(prices));
  }

  // API

  return { start, stop };
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
