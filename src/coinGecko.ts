import { ethers } from "ethers";

const availableChains: { [key: number]: string } = {
  1: "ethereum",
  250: "fantom",
  10: "optimism",
};

type UnixTimestamp = number;

export async function getPrice(
  token: string,
  chainId: number,
  startTime: UnixTimestamp,
  endTime: UnixTimestamp
) {
  const chain = availableChains[chainId];
  let data = null;

  if (token === ethers.constants.AddressZero) {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${chain}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
    );

    console.log(
      `https://api.coingecko.com/api/v3/coins/${chain}/market_chart/range?vs_currency=usd&from=${startTime}&to${endTime}`
    );
    data = await response.json();
  } else {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${chain}/contract/${token.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
    );
    console.log(
      `https://api.coingecko.com/api/v3/coins/${chain}/contract/${token.toLowerCase()}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`
    );

    data = await response.json();
  }

  const startPrice = data.prices[0][1];
  const endPrice = data.prices[data.prices.length - 1][1];

  return (startPrice + endPrice) / 2;
}
