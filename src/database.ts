import config from "./config.js";
import path from "node:path";
import { JsonStorage } from "chainsauce";

export default function load(chainId?: number): JsonStorage {
  let storageDir = config.storageDir;

  if (chainId) {
    if (config.chains.find((chain) => chain.id === chainId) === undefined) {
      throw new Error(`Chain ${chainId} not foound`);
    }

    storageDir = path.join(storageDir, chainId.toString());
  }

  return new JsonStorage(storageDir);
}
