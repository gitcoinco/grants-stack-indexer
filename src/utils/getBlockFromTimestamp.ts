import { RetryProvider } from "chainsauce";
import { Chain } from "../config.js";

const cache: Map<number, Map<number, number>> = new Map();

function getCacheForChain(chain: Chain): Map<number, number> {
  let chainCache = cache.get(chain.id);

  if (!chainCache) {
    chainCache = new Map();
    cache.set(chain.id, chainCache);
  }

  return chainCache;
}

export async function getBlockFromTimestamp(
  chain: Chain,
  timestampMs: number,
  marginMs = 0
): Promise<number> {
  const provider = new RetryProvider(
    {
      url: chain.rpc,
      timeout: 5 * 60 * 1000,
    },
    5,
    10
  );

  const chainCache = getCacheForChain(chain);

  // Get a block timestamp from the cache or the provider
  async function getBlockTimestamp(number: number): Promise<number> {
    const cachedBlock = chainCache.get(number);

    if (cachedBlock) {
      return cachedBlock;
    }

    const block = await provider.getBlock(number);

    chainCache.set(block.number, block.timestamp);

    return block.timestamp;
  }

  const targetTimestamp = Math.floor(timestampMs / 1000);

  // Get the current block number
  const currentBlockNumber = await provider._getInternalBlockNumber(1000 * 30);

  // by default we binary search from 0 to the current block number
  let start = 0;
  let end = currentBlockNumber;

  // try and find a closer range to search in
  for (const entry of chainCache.entries()) {
    const differenceMs = Math.abs(entry[1] - targetTimestamp) * 1000;

    // early exit if we find a block with a matching timestamp
    if (differenceMs <= marginMs) {
      return entry[0];
    }

    if (entry[1] < targetTimestamp) {
      start = Math.max(start, entry[0]);
    }

    if (entry[1] > targetTimestamp) {
      end = Math.min(end, entry[0]);
    }
  }

  let blockNumber = null;

  // Perform binary search
  while (start <= end) {
    blockNumber = Math.floor((start + end) / 2);

    // get the current block timestamp (could be cached)
    const blockTimestamp = await getBlockTimestamp(blockNumber);

    const differenceMs = Math.abs(blockTimestamp - targetTimestamp) * 1000;

    // If the difference is within the margin, we found the block
    if (differenceMs <= marginMs) {
      break;
    }

    if (blockTimestamp < targetTimestamp) {
      // The target timestamp is in the second half of the search range
      start = blockNumber + 1;
    } else if (blockTimestamp > targetTimestamp) {
      // The target timestamp is in the first half of the search range
      end = blockNumber - 1;
    } else {
      // Found a block with a timestamp exact to the target timestamp
      break;
    }
  }

  if (!blockNumber) {
    throw new Error(
      `Could not find block for timestamp ${targetTimestamp} and chain ${chain.name}`
    );
  }

  // just an assertion for safety, it should never happen
  const differenceMs =
    Math.abs((await getBlockTimestamp(blockNumber)) - targetTimestamp) * 1000;

  if (differenceMs > marginMs) {
    throw new Error(
      `Could not find block for timestamp ${targetTimestamp} and chain ${chain.name}`
    );
  }

  return blockNumber;
}
