import { ethers } from "ethers";
import fetchRetry from "./fetchRetry.js";

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

export async function getPrices(
  token: string,
  chainId: number,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp
): Promise<[Timestamp, Price][]> {
  if (chainId === 5) {
    return [];
  }

  const platform = platforms[chainId];
  const nativeToken = nativeTokens[chainId];

  // not supported
  if (!platform) {
    throw new Error(`Prices for chain ID ${chainId} are not supported.`);
  }

  const url =
    token === ethers.constants.AddressZero
      ? `https://api.coingecko.com/api/v3/coins/${nativeToken}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
      : `https://api.coingecko.com/api/v3/coins/${platform}/contract/${token.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`;

  const res = await fetchRetry(url, {
    retries: 5,
    backoff: 5000,
  });

  const data = await res.json();

  return data.prices;
}

export async function getPricesByHour(
  token: string,
  chainId: number,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp
): Promise<[Timestamp, Price][]> {
  const prices = await getPrices(token, chainId, startTime, endTime);
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

export async function getAveragePrice(
  token: string,
  chainId: number,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp
): Promise<Price> {
  const prices = await getPrices(token, chainId, startTime, endTime);

  if (prices.length === 0) {
    throw new Error(
      `No prices returned for ${chainId}:${token} from ${startTime} to ${endTime}`
    );
  }

  const total = prices.reduce((total, [_timestamp, price]) => total + price, 0);

  return total / prices.length;
}
