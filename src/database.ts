import config from "./config.js";
import path from "node:path";
import { JsonStorage } from "chainsauce";

const databases = new Map<number, JsonStorage>();

export default function load(chainId: number): JsonStorage {
  let db = databases.get(chainId);

  if (db) {
    return db;
  }

  if (config.chains.find((chain) => chain.id === chainId) === undefined) {
    throw new Error(`Chain ${chainId} not foound`);
  }

  const storageDir = path.join(config.storageDir, chainId.toString());
  db = new JsonStorage(storageDir);
  databases.set(chainId, db);
  return db;
}
