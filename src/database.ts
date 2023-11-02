import { getChainConfigById } from "./config.js";
import path from "node:path";
import { createJsonDatabase } from "./database/json.js";

export type Document = { id: string; [key: string]: unknown };

export interface Collection<T extends Document> {
  insert(document: T): Promise<T>;
  findById(id: string): Promise<T | null>;
  updateById(id: string, fun: (doc: T) => Omit<T, "id">): Promise<T | null>;
  upsertById(
    id: string,
    fun: (doc: T | null) => Omit<T, "id">
  ): Promise<boolean>;
  all(): Promise<T[]>;
}

export interface Database {
  collection<T extends Document>(name: string): Collection<T>;
  flushWrites(): Promise<void>;
}

export function createChainJsonDatabase(
  storageDir: string,
  chainId?: number
): Database {
  if (chainId) {
    const chain = getChainConfigById(chainId);

    storageDir = path.join(storageDir, chain.id.toString());
  }

  return createJsonDatabase({ dir: storageDir });
}
