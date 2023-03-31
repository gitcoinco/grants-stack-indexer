import { ethers } from "ethers";
import { wait } from "./utils.js";

const platforms: { [key: number]: string } = {
  1: "ethereum",
  250: "fantom",
  10: "optimistic-ethereum",
};

const nativeTokens: { [key: number]: string } = {
  1: "ethereum",
  250: "ftm",
  10: "ethereum",
};

type UnixTimestamp = number;

export const tokens = [
  {
    code: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: 1,
    decimals: 6,
  },
  {
    code: "ETH",
    address: "0x0",
    chainId: 1,
    decimals: 18,
  },
];

export async function getPrice(
  token: string,
  chainId: number,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp,
  retries = 5
) {
  const platform = platforms[chainId];
  const nativeToken = nativeTokens[chainId];

  // not supported
  if (!platform) {
    return 0;
  }

  let data = null;
  let attempt = 0;

  while (attempt < retries) {
    try {
      const url =
        token === ethers.constants.AddressZero
          ? `https://api.coingecko.com/api/v3/coins/${nativeToken}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
          : `https://api.coingecko.com/api/v3/coins/${platform}/contract/${token.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      data = await res.json();
    } catch (e) {
      attempt = attempt + 1;
      await wait(attempt * 1000);
      console.log("[Coingecko] Retrying, attempt:", attempt, e);
    }
  }

  console.log(data);

  const startPrice = data.prices[0][1];
  const endPrice = data.prices[data.prices.length - 1][1];

  return (startPrice + endPrice) / 2;
}
