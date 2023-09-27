import { BlockCache } from "../blockCache.js";

export async function getBlockFromTimestamp({
  chainId,
  timestampInSeconds,
  startBlock,
  endBlock,
  getBlockTimestamp,
  blockCache,
}: {
  chainId: number;
  timestampInSeconds: number;
  startBlock: bigint;
  endBlock: bigint;
  getBlockTimestamp: (blockNumber: bigint) => Promise<number>;
  blockCache?: BlockCache;
}): Promise<bigint | null> {
  async function getBlockTimestampCached(blockNumber: bigint) {
    if (blockCache) {
      const block = await blockCache.getBlockByNumber(chainId, blockNumber);

      if (block) {
        return block.timestamp;
      }

      const timestamp = await getBlockTimestamp(blockNumber);

      // console.log("saving");
      await blockCache.saveBlock({
        chainId,
        blockNumber,
        timestamp,
      });
      return timestamp;
    }

    const timestamp = await getBlockTimestamp(blockNumber);

    return timestamp;
  }

  let low = startBlock;
  let high = endBlock;

  if (blockCache) {
    const { before: lowerBound, after: upperBound } =
      await blockCache.getClosestBoundsForTimestamp(
        chainId,
        timestampInSeconds
      );

    if (lowerBound) {
      low = lowerBound.blockNumber;
    }

    if (upperBound) {
      high = upperBound.blockNumber;
    }
  }

  let result = null;

  while (low <= high) {
    const mid = (low + high) / BigInt(2);
    const midTimestamp = await getBlockTimestampCached(mid);

    if (midTimestamp >= timestampInSeconds) {
      result = mid;
      high = mid - BigInt(1);
    } else {
      low = mid + BigInt(1);
    }
  }

  return result;
}
