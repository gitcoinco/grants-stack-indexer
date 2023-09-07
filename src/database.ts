import { getChainConfigById } from "./config.js";
import path from "node:path";
import { JsonStorage } from "chainsauce";

export default function load(
  storageDir: string,
  chainId?: number
): JsonStorage {
  if (chainId) {
    const chain = getChainConfigById(chainId);

    storageDir = path.join(storageDir, chain.id.toString());
  }

  return new JsonStorage(storageDir);
}
