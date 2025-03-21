import abi from "./abi/ProjectRegistry.js";
import { Contract } from "#indexer/contracts/types.js";
import { projectCreatedHandler } from "../v2/eventHandlers/projectCreated.js";

export const projectRegistryV1: Contract = {
  abi,
  handlers: {
    ProjectCreated: projectCreatedHandler,
  },
};
