import { BlockCache } from "../blockCache.js";

export async function getBlockFromTimestamp(
  chainId: number,
  timestampInMs: number,
  startBlock: bigint,
  endBlock: bigint,
  getBlockTimestamp: (blockNumber: bigint) => Promise<number>,
  blockCache: BlockCache
): Promise<bigint> {
  console.log("finding block for timestamp", new Date(timestampInMs));

  async function getBlockTimestampCached(blockNumber: bigint) {
    const block = await blockCache.getBlockByNumber(chainId, blockNumber);

    if (block) {
      return block.timestamp;
    }

    const timestamp = await getBlockTimestamp(blockNumber);

    await blockCache.saveBlock({
      chainId,
      blockNumber,
      timestamp,
    });

    return timestamp;
  }

  const targetTimestamp = Math.floor(timestampInMs / 1000);
  const cachedBlock = await blockCache.getBlockByTimestamp(
    chainId,
    targetTimestamp
  );

  if (cachedBlock) {
    return cachedBlock.blockNumber;
  }

  const { before: lowerBound, after: upperBound } =
    await blockCache.getNearestBlocksByTimestamp(chainId, targetTimestamp);

  let low = lowerBound ? lowerBound.blockNumber : startBlock;
  let high = upperBound ? upperBound.blockNumber : endBlock;

  console.log("finding between", targetTimestamp, lowerBound, upperBound);

  while (low <= high) {
    const mid = (low + high) / BigInt(2);

    if (low === high) {
      console.error("-------------------> low === high");
      return low;
    }

    const midTimestamp = await getBlockTimestampCached(mid);

    if (midTimestamp < targetTimestamp) {
      low = mid + BigInt(1);
    } else if (midTimestamp > targetTimestamp) {
      high = mid - BigInt(1);
    } else {
      return mid;
    }
  }

  return low;
}
