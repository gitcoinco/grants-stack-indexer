import config from "./config.js";
import path from "node:path";
import { JsonStorage } from "chainsauce";

export default function load(chainId: number): JsonStorage {
  if (config.chains.find((chain) => chain.id === chainId) === undefined) {
    throw new Error(`Chain ${chainId} not foound`);
  }

  const storageDir = path.join(config.storageDir, chainId.toString());
  return new JsonStorage(storageDir);
}
