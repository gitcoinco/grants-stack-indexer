import { ethers } from "ethers";

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

export async function getPrice(
  token: string,
  chainId: number,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp
) {
  const platform = platforms[chainId];
  const nativeToken = nativeTokens[chainId];

  // not supported
  if (!platform) {
    return 0;
  }

  let data = null;

  if (token === ethers.constants.AddressZero) {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${nativeToken}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
    );
    data = await response.json();
  } else {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${platform}/contract/${token.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
    );

    data = await response.json();
  }

  const startPrice = data.prices[0][1];
  const endPrice = data.prices[data.prices.length - 1][1];

  return (startPrice + endPrice) / 2;
}
