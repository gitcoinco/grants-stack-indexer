import { tokenDecimals } from "../config.js";

export type Price = {
  token: string;
  code: string;
  price: number;
  timestamp: number;
  block: number;
};

// NOTE: prices should be sorted by block number, so we can iterate backwards
export async function getUSDConversionRate(
  prices: Price[],
  chainId: number,
  token: string,
  blockNumber?: number
): Promise<Price & { decimals: number }> {
  let closestPrice: Price | null = null;

  // goerli
  if (chainId === 5) {
    return {
      token,
      code: "ETH",
      price: 1,
      timestamp: 0,
      block: 0,
      decimals: 18,
    };
  }

  if (!tokenDecimals[chainId][token]) {
    console.error(`Unsupported token ${token} for chain ${chainId}`);
    return {
      token,
      code: "Unknown",
      price: 0,
      timestamp: 0,
      block: 0,
      decimals: 18,
    };
  }

  for (let i = prices.length - 1; i >= 0; i--) {
    const price = prices[i];
    if (price.token === token && (!blockNumber || price.block < blockNumber)) {
      closestPrice = price;
      break;
    }
  }

  if (!closestPrice) {
    throw Error(`Price not found, token ${token} for chain ${chainId}`);
  }

  return { ...closestPrice, decimals: tokenDecimals[chainId][token] };
}

export async function convertToUSD(
  prices: Price[],
  chainId: number,
  token: string,
  amount: bigint,
  blockNumber?: number
): Promise<{ amount: number; price: number }> {
  const closestPrice = await getUSDConversionRate(
    prices,
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

export async function convertFromUSD(
  prices: Price[],
  chainId: number,
  token: string,
  amount: number,
  blockNumber: number
): Promise<{ amount: bigint; price: number }> {
  const closestPrice = await getUSDConversionRate(
    prices,
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
