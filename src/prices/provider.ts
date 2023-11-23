import { Logger } from "pino";
import { getChainConfigById } from "../config.js";
import { UnknownTokenError } from "./common.js";
import { convertTokenToFiat, convertFiatToToken } from "../tokenMath.js";
import { Database } from "../database/index.js";
import { Price } from "../database/schema.js";
import { Address, ChainId } from "../types.js";

export type PriceWithDecimals = Price & { tokenDecimals: number };

interface PriceProviderConfig {
  updateEveryMs?: number;
  db: Database;
  logger: Logger;
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
  const { db, logger: _logger } = config;

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

    const price = await db.query({
      type: "TokenPriceByBlockNumber",
      chainId,
      tokenAddress,
      blockNumber,
    });

    if (price === null) {
      throw Error(
        `Price not found for token ${tokenAddress} on chain ${chainId} and block ${blockNumber}`
      );
    }

    return { ...price, tokenDecimals: token.decimals };
  }

  return {
    convertToUSD,
    convertFromUSD,
    getAllPricesForChain,
    getUSDConversionRate,
  };
}
