// estimates block number for a given timestamp using block speed
async function estimateBlockNumber(
  targetTimestamp: number,
  startBlock: number,
  endBlock: number,
  getBlockTimestamp: (blockNumber: number) => Promise<number>
): Promise<number> {
  const blockDistance = Math.abs(endBlock - startBlock);
  const startTimestamp = await getBlockTimestamp(startBlock);
  const endTimestamp = await getBlockTimestamp(endBlock);
  const timeDistanceInSeconds = Math.abs(endTimestamp - startTimestamp);

  // Estimate blocks per second
  const blocksPerSecond = blockDistance / timeDistanceInSeconds;

  // Now, you can use `blocksPerSecond` to adjust your block number estimation.
  // For instance, if you know the target timestamp is X seconds away from startTimestamp, you could estimate:
  const secondsToTarget = Math.abs(targetTimestamp - startTimestamp);
  const estimatedBlocksToTarget = blocksPerSecond * secondsToTarget;
  const estimatedBlockNumber = startBlock + Math.round(estimatedBlocksToTarget);

  return estimatedBlockNumber;
}

/**
 * Finds the closest block number for a given timestamp,
 * this binary searches for a range of blockEstimationThreshold
 * and then estimates the block number using the block speed
 * inside that range.
 *
 * @param timestampInMs timestamp in milliseconds
 * @param startBlock the block number to start searching from
 * @param endBlock the block number to end searching at
 * @param getBlockTimestamp a function that returns the timestamp for a given block number,
 * cache the block timestamps to increase performance
 * @returns the closest block number for the given timestamp
 */
export async function getBlockFromTimestamp(
  timestampInMs: number,
  startBlock: number,
  endBlock: number,
  getBlockTimestamp: (blockNumber: number) => Promise<number>
): Promise<number | undefined> {
  const blockEstimationThreshold = 10000;
  const targetTimestamp = Math.floor(timestampInMs / 1000);

  // by default we binary search from 0 to the current block number
  let start = startBlock;
  let end = endBlock;

  let blockNumber = undefined;

  // If the block range during binary search is less than the threshold,
  // we estimate the block using the block speed

  // Perform binary search
  while (start <= end) {
    const blockDistance = Math.abs(end - start);

    // Check the difference and set the rounding base
    let base = 1;

    if (blockDistance > 1000000) {
      base = 100000;
    } else if (blockDistance > 100000) {
      base = 10000;
    } else if (blockDistance > 10000) {
      base = 1000;
    } else if (blockDistance > 1000) {
      base = 100;
    }

    blockNumber = (start + end) / 2;

    // Round to the nearest base to make the calls to getBlockTimestamp
    // cache friendly
    blockNumber = Math.round(blockNumber / base) * base;

    // get the current block timestamp
    const blockTimestamp = await getBlockTimestamp(blockNumber);

    if (blockTimestamp < targetTimestamp) {
      // The target timestamp is in the second half of the search range

      if (end - blockNumber < blockEstimationThreshold) {
        return estimateBlockNumber(
          targetTimestamp,
          blockNumber,
          end,
          getBlockTimestamp
        );
      }

      start = blockNumber + 1;
    } else if (blockTimestamp > targetTimestamp) {
      if (blockNumber - start < blockEstimationThreshold) {
        return estimateBlockNumber(
          targetTimestamp,
          start,
          blockNumber,
          getBlockTimestamp
        );
      }
      // The target timestamp is in the first half of the search range
      end = blockNumber - 1;
    } else {
      // Found a block with a timestamp exact to the target timestamp
      break;
    }
  }

  return blockNumber;
}
