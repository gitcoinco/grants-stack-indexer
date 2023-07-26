import { CHAINS } from "./config.js";
import path from "node:path";
import { JsonStorage } from "chainsauce";

export default function load(
  storageDir: string,
  chainId?: number
): JsonStorage {
  if (chainId) {
    if (CHAINS.find((chain) => chain.id === chainId) === undefined) {
      throw new Error(`Chain ${chainId} not foound`);
    }

    storageDir = path.join(storageDir, chainId.toString());
  }

  return new JsonStorage(storageDir);
}
