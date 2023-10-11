import { getChainConfigById } from "./config.js";
import path from "node:path";
import { createJsonDatabase, Database } from "chainsauce";

export default function load(storageDir: string, chainId?: number): Database {
  if (chainId) {
    const chain = getChainConfigById(chainId);

    storageDir = path.join(storageDir, chain.id.toString());
  }

  return createJsonDatabase(storageDir, {});
}
