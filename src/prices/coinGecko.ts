import { ethers } from "ethers";
import { ChainId, FetchInterface } from "../types.js";
import { Address } from "../types.js";
import { parseAddress } from "../address.js";

const platforms: { [key: number]: string } = {
  1: "ethereum",
  250: "fantom",
  10: "optimistic-ethereum",
  42161: "arbitrum-one",
  43114: "avalanche",
};

const nativeTokens: { [key: number]: string } = {
  1: "ethereum",
  250: "fantom",
  10: "ethereum",
  42161: "ethereum",
  43114: "avalanche-2",
};

type TimestampInMs = number;
type Price = number;

export async function fetchPricesForRange({
  chainId,
  tokenAddress,
  startTimestampInMs,
  endTimestampInMs,
  coingeckoApiKey,
  coingeckoApiUrl,
  fetch,
}: {
  chainId: ChainId;
  tokenAddress: Address;
  startTimestampInMs: number;
  endTimestampInMs: number;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  fetch: FetchInterface;
}): Promise<[TimestampInMs, Price][]> {
  const platform = platforms[chainId];
  const nativeToken = nativeTokens[chainId];

  if (!(chainId in platforms)) {
    throw new Error(`Prices for chain ID ${chainId} are not supported.`);
  }

  const isNativeToken =
    tokenAddress === parseAddress(ethers.constants.AddressZero);

  const startTimestampInSecs = Math.floor(startTimestampInMs / 1000);
  const endTimestampInSecs = Math.floor(endTimestampInMs / 1000);

  const path = isNativeToken
    ? `/coins/${nativeToken}/market_chart/range?vs_currency=usd&from=${startTimestampInSecs}&to=${endTimestampInSecs}`
    : `/coins/${platform}/contract/${tokenAddress.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTimestampInSecs}&to=${endTimestampInSecs}`;

  const headers: HeadersInit =
    coingeckoApiKey === null
      ? {}
      : {
          "x-cg-pro-api-key": coingeckoApiKey,
        };

  const res = await fetch(`${coingeckoApiUrl}${path}`, {
    headers,
  });

  const data = (await res.json()) as { prices: Array<[TimestampInMs, Price]> };

  return data.prices;
}
