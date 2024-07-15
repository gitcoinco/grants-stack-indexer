import { ProtocolContracts } from "#indexer/contracts/types.js";
import { projectRegistry } from "./projectRegistry/index.js";

export const AlloV1: ProtocolContracts = {
  ProjectRegistry: projectRegistry,
};
