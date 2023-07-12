import { ethers } from "ethers";
import fetchRetry from "../utils/fetchRetry.js";
import { Token } from "../config.js";

const platforms: { [key: number]: string } = {
  1: "ethereum",
  250: "fantom",
  10: "optimistic-ethereum",
};

const nativeTokens: { [key: number]: string } = {
  1: "ethereum",
  250: "fantom",
  10: "ethereum",
};

type Timestamp = number;
type UnixTimestamp = number;
type Price = number;

export async function getPricesByHour(
  token: Token,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp,
  config: { coingeckoApiKey: string | null; coingeckoApiUrl: string }
): Promise<[Timestamp, Price][]> {
  const prices = await fetchPrices(token, startTime, endTime, config);
  const groupedByHour: Record<number, Price[]> = {};
  const hour = 60 * 60 * 1000;
  const result: [Timestamp, Price][] = [];

  // group the prices by hour
  for (const price of prices) {
    const key = Math.floor(price[0] / hour) * hour;
    groupedByHour[key] = groupedByHour[key] ?? [];
    groupedByHour[key].push(price[1]);
  }

  // reduce groups into a single price by calculating their average
  for (const key in groupedByHour) {
    const total = groupedByHour[key].reduce((total, price) => total + price, 0);
    result.push([Number(key), total / groupedByHour[key].length]);
  }

  return result;
}

async function fetchPrices(
  token: Token,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp,
  config: { coingeckoApiKey: string | null; coingeckoApiUrl: string }
): Promise<[Timestamp, Price][]> {
  if (token.chainId === 5) {
    return [];
  }

  const platform = platforms[token.chainId];
  const nativeToken = nativeTokens[token.chainId];

  if (!(token.chainId in platforms)) {
    throw new Error(`Prices for chain ID ${token.chainId} are not supported.`);
  }

  const isNativeToken = token.address === ethers.constants.AddressZero;

  const path = isNativeToken
    ? `/coins/${nativeToken}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
    : `/coins/${platform}/contract/${token.address.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`;

  const headers: HeadersInit =
    config.coingeckoApiKey === null
      ? {}
      : {
          "x-cg-pro-api-key": config.coingeckoApiKey,
        };

  const res = await fetchRetry(`${config.coingeckoApiUrl}${path}`, {
    headers,
    retries: 5,
    backoff: 10000,
  });

  const data = (await res.json()) as { prices: Array<[Timestamp, Price]> };

  return data.prices;
}
