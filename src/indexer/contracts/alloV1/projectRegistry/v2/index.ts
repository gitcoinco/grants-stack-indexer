import abi from "./abi/ProjectRegistry.js";
import { Contract } from "#indexer/contracts/types.js";
import { projectRegistryV2Handlers } from "./eventHandlers/index.js";

export const projectRegistryV2: Contract = {
  abi,
  handlers: projectRegistryV2Handlers,
};
