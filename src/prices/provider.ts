import { Logger } from "pino";
import { getChainConfigById } from "../config.js";
import { UnknownTokenError } from "./common.js";
import { convertTokenToFiat, convertFiatToToken } from "../tokenMath.js";
import { Database } from "../database/index.js";
import { Price } from "../database/schema.js";
import { Address, ChainId, FetchInterface } from "../types.js";
import { LRUCache } from "lru-cache";
import { fetchPricesForRange } from "./coinGecko.js";

export type PriceWithDecimals = Omit<Price, "id"> & { tokenDecimals: number };

const ROUND_BLOCK_NUMBER_TO = 2000n;

interface PriceProviderConfig {
  db: Database;
  logger: Logger;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  getBlockTimestampInMs: (
    chainId: ChainId,
    blockNumber: bigint
  ) => Promise<number>;
  fetch: FetchInterface;
}

export interface PriceProvider {
  convertToUSD: (
    chainId: ChainId,
    token: Address,
    amount: bigint,
    blockNumber: bigint | "latest"
  ) => Promise<{ amount: number; price: number }>;
  convertFromUSD: (
    chainId: ChainId,
    token: Address,
    amount: number,
    blockNumber: bigint | "latest"
  ) => Promise<{ amount: bigint; price: number }>;
  getAllPricesForChain: (chainId: ChainId) => Promise<Price[]>;
  getUSDConversionRate: (
    chainId: ChainId,
    tokenAddress: Address,
    blockNumber: bigint | "latest"
  ) => Promise<PriceWithDecimals>;
}

export function createPriceProvider(
  config: PriceProviderConfig
): PriceProvider {
  const { db, logger } = config;
  const cache = new LRUCache<string, PriceWithDecimals>({
    max: 100,
  });

  // PUBLIC

  async function getAllPricesForChain(chainId: ChainId): Promise<Price[]> {
    return await db.query({ type: "AllChainPrices", chainId });
  }

  // INTERNALS

  async function convertToUSD(
    chainId: ChainId,
    token: Address,
    amount: bigint,
    blockNumber: bigint | "latest"
  ): Promise<{ amount: number; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );

    return {
      amount: convertTokenToFiat({
        tokenAmount: amount,
        tokenDecimals: closestPrice.tokenDecimals,
        tokenPrice: closestPrice.priceInUsd,
        tokenPriceDecimals: 8,
      }),
      price: closestPrice.priceInUsd,
    };
  }

  async function convertFromUSD(
    chainId: ChainId,
    token: Address,
    amountInUSD: number,
    blockNumber: bigint | "latest"
  ): Promise<{ amount: bigint; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );

    return {
      amount: convertFiatToToken({
        fiatAmount: amountInUSD,
        tokenPrice: closestPrice.priceInUsd,
        tokenPriceDecimals: 8,
        tokenDecimals: closestPrice.tokenDecimals,
      }),
      price: 1 / closestPrice.priceInUsd, // price is the token price in USD, we return the inverse
    };
  }

  async function getUSDConversionRate(
    chainId: number,
    tokenAddress: Address,
    blockNumber: bigint | "latest"
  ): Promise<PriceWithDecimals> {
    const chain = getChainConfigById(chainId);

    const token = chain.tokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (token === undefined) {
      throw new UnknownTokenError(tokenAddress, chainId);
    }

    let price: PriceWithDecimals | null = null;

    if (blockNumber === "latest") {
      const priceWithoutDecimals = await db.query({
        type: "TokenPriceByBlockNumber",
        chainId,
        tokenAddress,
        blockNumber,
      });

      if (priceWithoutDecimals !== null) {
        price = {
          ...priceWithoutDecimals,
          tokenDecimals: token.decimals,
        };
      }
    } else {
      const roundedBlockNumber =
        blockNumber - (blockNumber % ROUND_BLOCK_NUMBER_TO);
      const cacheKey = `${chainId}-${tokenAddress}-${roundedBlockNumber}`;
      const cachedPrice = cache.get(cacheKey);

      if (cachedPrice !== undefined) {
        price = cachedPrice;
      } else {
        logger.debug({
          msg: "Fetching price",
          tokenAddress,
          roundedBlockNumber,
        });

        const blockTimestampInMs = await config.getBlockTimestampInMs(
          chainId,
          roundedBlockNumber
        );

        const oneHourInMs = 60 * 60 * 1000;

        const prices = await fetchPricesForRange({
          chainId: token.priceSource.chainId,
          tokenAddress,
          startTimestampInMs: blockTimestampInMs,
          endTimestampInMs: blockTimestampInMs + oneHourInMs,
          coingeckoApiUrl: config.coingeckoApiUrl,
          coingeckoApiKey: config.coingeckoApiKey,
          fetch: (url, opts) => config.fetch(url, opts),
        });

        if (prices.length > 0) {
          const [priceTimestamp, priceInUsd] = prices[0];
          const newPrice = {
            chainId,
            tokenAddress: tokenAddress,
            blockNumber: roundedBlockNumber,
            priceInUsd: priceInUsd,
            timestamp: new Date(blockTimestampInMs),
          };

          const timestampDiff = Math.abs(blockTimestampInMs - priceTimestamp);

          if (timestampDiff > oneHourInMs) {
            logger.warn({
              msg: "Timestamp diff between block and Coingecko timestamps is larger than 1 hour",
              blockTimestamp: blockTimestampInMs,
              priceTimestamp: priceTimestamp,
              timestampDiff,
            });
          }

          await db.mutate({
            type: "InsertManyPrices",
            prices: [newPrice],
          });

          price = { ...newPrice, tokenDecimals: token.decimals };
          cache.set(cacheKey, price);
        }
      }
    }

    if (price === null) {
      throw Error(
        `Price not found for token ${tokenAddress} on chain ${chainId} and block ${blockNumber}`
      );
    }

    return price;
  }

  return {
    convertToUSD,
    convertFromUSD,
    getAllPricesForChain,
    getUSDConversionRate,
  };
}
