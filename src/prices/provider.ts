import { Logger } from "pino";
import { getChainConfigById } from "../config.js";
import {
  Price,
  PriceWithDecimals,
  readPricesFile,
  UnknownTokenError,
} from "./common.js";
import { convertTokenToFiat, convertFiatToToken } from "../tokenMath.js";
import { ChainId, Address } from "../indexer/types.js";

const DEFAULT_REFRESH_PRICE_INTERVAL_MS = 10000;

interface PriceProviderConfig {
  updateEveryMs?: number;
  chainDataDir: string;
  logger: Logger;
}

export interface PriceProvider {
  convertToUSD: (
    chainId: ChainId,
    token: string,
    amount: bigint,
    blockNumber?: number
  ) => Promise<{ amount: number; price: number }>;
  convertFromUSD: (
    chainId: ChainId,
    token: string,
    amount: number,
    blockNumber?: number
  ) => Promise<{ amount: bigint; price: number }>;
  getAllPricesForChain: (chainId: number) => Promise<Price[]>;
  getUSDConversionRate: (
    chainId: ChainId,
    tokenAddress: string,
    blockNumber?: number
  ) => Promise<PriceWithDecimals>;
}

export function createPriceProvider(
  config: PriceProviderConfig
): PriceProvider {
  const { logger: _logger } = config;

  // STATE

  type ChainPrices = {
    lastUpdatedAt: Date;
    pricesByTokenAddress: Promise<Map<Address, Price[]>>;
  };

  const prices: Record<ChainId, ChainPrices> = {};

  // PUBLIC

  async function getAllPricesForChain(chainId: ChainId): Promise<Price[]> {
    return readPricesFile(chainId, config.chainDataDir);
  }

  // INTERNALS

  function shouldReloadPrices(prices: ChainPrices) {
    return (
      new Date().getTime() - prices.lastUpdatedAt.getTime() >
      (config.updateEveryMs ?? DEFAULT_REFRESH_PRICE_INTERVAL_MS)
    );
  }

  function loadChainPricesFromDisk(chainId: ChainId) {
    const tokenPrices = readPricesFile(chainId, config.chainDataDir).then(
      (prices) => {
        // group prices by token address
        return prices.reduce((acc, price) => {
          const tokenAddress = price.token;
          const tokenPrices = acc.get(tokenAddress) ?? [];
          tokenPrices.push(price);
          acc.set(tokenAddress, tokenPrices);
          return acc;
        }, new Map<Address, Price[]>());
      }
    );

    prices[chainId] = {
      pricesByTokenAddress: tokenPrices,
      lastUpdatedAt: new Date(),
    };

    return tokenPrices;
  }

  async function getPricesForChainAndTokenAddress(
    chainId: number,
    tokenAddress: Address
  ): Promise<Price[] | null> {
    if (!(chainId in prices) || shouldReloadPrices(prices[chainId])) {
      await loadChainPricesFromDisk(chainId);
    }

    const pricesByTokenAddress = await prices[chainId].pricesByTokenAddress;

    return pricesByTokenAddress.get(tokenAddress) ?? null;
  }

  async function convertToUSD(
    chainId: number,
    token: string,
    amount: bigint,
    blockNumber?: number
  ): Promise<{ amount: number; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );

    return {
      amount: convertTokenToFiat({
        tokenAmount: amount,
        tokenDecimals: closestPrice.decimals,
        tokenPrice: closestPrice.price,
        tokenPriceDecimals: 8,
      }),
      price: closestPrice.price,
    };
  }

  async function convertFromUSD(
    chainId: number,
    token: string,
    amountInUSD: number,
    blockNumber?: number
  ): Promise<{ amount: bigint; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );

    return {
      amount: convertFiatToToken({
        fiatAmount: amountInUSD,
        tokenPrice: closestPrice.price,
        tokenPriceDecimals: 8,
        tokenDecimals: closestPrice.decimals,
      }),
      price: 1 / closestPrice.price, // price is the token price in USD, we return the inverse
    };
  }

  async function getUSDConversionRate(
    chainId: number,
    tokenAddress: string,
    blockNumber?: number
  ): Promise<Price & { decimals: number }> {
    let closestPrice: Price | null = null;

    const chain = getChainConfigById(chainId);

    const token = chain.tokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (token === undefined) {
      throw new UnknownTokenError(tokenAddress, chainId);
    }

    const pricesForToken = await getPricesForChainAndTokenAddress(
      chainId,
      tokenAddress.toLowerCase() as Address
    );

    if (pricesForToken === null) {
      throw new Error(
        `No prices found for token ${tokenAddress} on chain ${chainId} at ${String(
          blockNumber
        )}`
      );
    }

    const firstAvailablePrice = pricesForToken.at(0)!;
    const lastAvailablePrice = pricesForToken.at(-1)!;

    if (blockNumber === undefined) {
      closestPrice = lastAvailablePrice;
    } else if (blockNumber > lastAvailablePrice.block) {
      // TODO decide how to warn about potential inconsistencies without spamming
      // logger.warn(
      //   `requested price for block ${blockNumber} newer than last available ${lastAvailablePrice.block}`
      // );
      closestPrice = lastAvailablePrice;
    } else if (blockNumber < firstAvailablePrice.block) {
      // TODO decide how to warn about potential inconsistencies without spamming
      // logger.warn(
      //   `requested price for block ${blockNumber} older than earliest available ${firstAvailablePrice.block}`
      // );
      closestPrice = firstAvailablePrice;
    } else {
      closestPrice =
        pricesForToken.reverse().find((p) => p.block < blockNumber) ?? null;
    }

    if (closestPrice === null) {
      throw Error(
        `Price not found for token ${tokenAddress} on chain ${chainId}`
      );
    }

    return { ...closestPrice, decimals: token.decimals };
  }

  return {
    convertToUSD,
    convertFromUSD,
    getAllPricesForChain,
    getUSDConversionRate,
  };
}
