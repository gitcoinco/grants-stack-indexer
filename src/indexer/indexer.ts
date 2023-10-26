import { Logger } from "pino";
import { PriceProvider } from "../prices/provider.js";
import { Database, Indexer as ChainsauceIndexer } from "chainsauce";

import abis from "./abis/index.js";

export interface EventHandlerContext {
  chainId: number;
  db: Database;
  ipfsGet: <T>(cid: string) => Promise<T | undefined>;
  priceProvider: PriceProvider;
  logger: Logger;
}

export type Indexer = ChainsauceIndexer<typeof abis, EventHandlerContext>;
