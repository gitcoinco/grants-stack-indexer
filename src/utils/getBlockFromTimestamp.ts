export async function getBlockFromTimestamp({
  timestampInSeconds,
  startBlock,
  endBlock,
  getBlockTimestamp,
}: {
  timestampInSeconds: number;
  startBlock: bigint;
  endBlock: bigint;
  getBlockTimestamp: (blockNumber: bigint) => Promise<number>;
}): Promise<bigint | null> {
  let low = startBlock;
  let high = endBlock;

  let result = null;

  while (low <= high) {
    const mid = (low + high) / BigInt(2);
    const midTimestamp = await getBlockTimestamp(mid);

    if (midTimestamp >= timestampInSeconds) {
      result = mid;
      high = mid - BigInt(1);
    } else {
      low = mid + BigInt(1);
    }
  }

  return result;
}
