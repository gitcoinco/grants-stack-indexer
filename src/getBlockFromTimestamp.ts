import { RetryProvider } from "chainsauce";
import { memoize } from "./utils.js";

import { Chain } from "./config.js";

const getProvider = memoize((url: string) => {
  const provider = new RetryProvider({
    url: url,
    timeout: 5 * 60 * 1000,
  });

  const lastBlock = provider._getInternalBlockNumber(1000 * 30);

  const getBlockNumber = () => lastBlock;
  const getBlock = memoize<number, ReturnType<typeof provider.getBlock>>(
    (number) => {
      return provider.getBlock(number);
    }
  );

  return { getBlockNumber, getBlock };
});

export default async function getBlockFromTimestamp(
  chain: Chain,
  timestamp: number
): Promise<number> {
  const provider = getProvider(chain.rpc);
  const unixTimestamp = timestamp / 1000;

  const now = new Date().getTime() / 1000;

  const maxBlock = await provider.getBlockNumber();
  const prevBlock = await provider.getBlock(maxBlock - 10000);

  // estimate time per block in seconds
  const timePerBlock = Math.trunc(
    (now - prevBlock.timestamp) / (maxBlock - prevBlock.number)
  );

  // find an estimated block number
  const estimatedBlockNumber =
    maxBlock - Math.trunc((now - unixTimestamp) / timePerBlock);

  return estimatedBlockNumber;
}
