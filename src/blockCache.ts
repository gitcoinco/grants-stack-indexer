export type Block = {
  chainId: number;
  blockNumber: bigint;
  timestampInSecs: number;
};

export interface BlockCache {
  getTimestampByBlockNumber(
    chainId: number,
    blockNumber: bigint
  ): Promise<number | null>;
  getBlockNumberByTimestamp(
    chainId: number,
    timestampInSecs: number
  ): Promise<bigint | null>;
  saveBlock(block: Block): Promise<void>;
  getClosestBoundsForTimestamp(
    chainId: number,
    timestampInSecs: number
  ): Promise<{ before: Block | null; after: Block | null }>;
}
