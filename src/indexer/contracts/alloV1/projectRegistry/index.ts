import { NameContracts } from "#indexer/contracts/types.js";
import { projectRegistryV1 } from "./v1/index.js";
import { projectRegistryV2 } from "./v2/index.js";

export const projectRegistry: NameContracts = {
  V1: projectRegistryV1,
  V2: projectRegistryV2,
};
