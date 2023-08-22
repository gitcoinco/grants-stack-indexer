import { Logger } from "pino";
import { CHAINS } from "../config.js";
import { Price, readPricesFile } from "./common.js";
import { UnknownTokenError } from "../indexer/utils.js";

const DEFAULT_REFRESH_PRICE_INTERVAL_MS = 10000;

interface PriceProviderConfig {
  updateEveryMs?: number;
  storageDir: string;
  logger: Logger;
}

export interface PriceProvider {
  convertToUSD: (
    chainId: number,
    token: string,
    amount: bigint,
    blockNumber?: number
  ) => Promise<{ amount: number; price: number }>;
  convertFromUSD: (
    chainId: number,
    token: string,
    amount: number,
    blockNumber: number
  ) => Promise<{ amount: bigint; price: number }>;
  getAllPricesForChain: (chainId: number) => Promise<Price[]>;
}

export function createPriceProvider(
  config: PriceProviderConfig
): PriceProvider {
  const { logger } = config;

  // STATE

  type Prices = { lastUpdatedAt: Date; prices: Promise<Price[]> };

  const prices: { [key: number]: Prices } = {};

  // PUBLIC

  async function getAllPricesForChain(chainId: number): Promise<Price[]> {
    return readPricesFile(chainId, config.storageDir);
  }

  // INTERNALS

  function shouldRefreshPrices(prices: Prices) {
    return (
      new Date().getTime() - prices.lastUpdatedAt.getTime() >
      (config.updateEveryMs ?? DEFAULT_REFRESH_PRICE_INTERVAL_MS)
    );
  }

  function updatePrices(chainId: number) {
    const chainPrices = readPricesFile(chainId, config.storageDir);

    prices[chainId] = {
      prices: chainPrices,
      lastUpdatedAt: new Date(),
    };

    return chainPrices;
  }

  async function getPrices(chainId: number): Promise<Price[]> {
    if (!(chainId in prices) || shouldRefreshPrices(prices[chainId])) {
      await updatePrices(chainId);
    }

    return prices[chainId].prices;
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
    const usdDecimalFactor = Math.pow(10, 8);
    const decimalFactor = 10n ** BigInt(closestPrice.decimals);

    const priceInDecimals = BigInt(
      Math.trunc(closestPrice.price * usdDecimalFactor)
    );

    return {
      amount:
        Number((amount * priceInDecimals) / decimalFactor) / usdDecimalFactor,
      price: closestPrice.price,
    };
  }

  async function convertFromUSD(
    chainId: number,
    token: string,
    amount: number,
    blockNumber: number
  ): Promise<{ amount: bigint; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );
    const usdDecimalFactor = Math.pow(10, 8);
    const decimalFactor =
      10n ** BigInt(closestPrice.decimals) / BigInt(usdDecimalFactor);

    const convertedAmountInDecimals =
      BigInt(Math.trunc((amount / closestPrice.price) * usdDecimalFactor)) *
      decimalFactor;

    return {
      amount: convertedAmountInDecimals,
      price: 1 / closestPrice.price,
    };
  }

  async function getUSDConversionRate(
    chainId: number,
    tokenAddress: string,
    blockNumber?: number
  ): Promise<Price & { decimals: number }> {
    let closestPrice: Price | null = null;

    const chain = CHAINS.find((c) => c.id === chainId);
    if (chain === undefined) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const token = chain.tokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (token === undefined) {
      throw new UnknownTokenError(tokenAddress, chainId);
    }

    const pricesForToken = (await getPrices(chainId)).filter(
      (p) => p.token === tokenAddress
    );
    if (pricesForToken.length === 0) {
      throw new Error(`No prices found for token ${tokenAddress}`);
    }

    const firstAvailablePrice = pricesForToken.at(0)!;
    const lastAvailablePrice = pricesForToken.at(-1)!;

    if (blockNumber === undefined) {
      closestPrice = lastAvailablePrice;
    } else if (blockNumber > lastAvailablePrice.block) {
      logger.warn(
        `requested price for block ${blockNumber} newer than last available ${lastAvailablePrice.block}`
      );
      closestPrice = lastAvailablePrice;
    } else if (blockNumber < firstAvailablePrice.block) {
      logger.warn(
        `requested price for block ${blockNumber} older than earliest available ${firstAvailablePrice.block}`
      );
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
  };
}
