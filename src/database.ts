import { chains, getDatabaseConfig } from "./config.js";
import path from "node:path";
import { JsonStorage } from "chainsauce";

// XXX needs to be a function parameter, not a module variable
const config = getDatabaseConfig();

export default function load(chainId?: number): JsonStorage {
  let storageDir = config.storageDir;

  if (chainId) {
    if (chains.find((chain) => chain.id === chainId) === undefined) {
      throw new Error(`Chain ${chainId} not foound`);
    }

    storageDir = path.join(storageDir, chainId.toString());
  }

  return new JsonStorage(storageDir);
}
