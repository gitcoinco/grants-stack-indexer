export type Block = {
  chainId: number;
  blockNumber: bigint;
  timestamp: number;
};

export interface BlockCache {
  init(): Promise<void>;
  getBlockByNumber(chainId: number, blockNumber: bigint): Promise<Block | null>;
  getBlockByTimestamp(
    chainId: number,
    timestamp: number
  ): Promise<Block | null>;
  saveBlock(block: Block): Promise<void>;
  getClosestBoundsForTimestamp(
    chainId: number,
    timestamp: number
  ): Promise<{ before: Block | null; after: Block | null }>;
}
