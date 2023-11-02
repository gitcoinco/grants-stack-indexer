import { Logger } from "pino";
import { PriceProvider } from "../prices/provider.js";
import { Indexer as ChainsauceIndexer } from "chainsauce";
import { PostgresDatabase } from "../database/postgres.js";

import abis from "./abis/index.js";

export interface EventHandlerContext {
  chainId: number;
  db: PostgresDatabase;
  ipfsGet: <T>(cid: string) => Promise<T | undefined>;
  priceProvider: PriceProvider;
  logger: Logger;
}

export type Indexer = ChainsauceIndexer<typeof abis, EventHandlerContext>;