import { contracts } from "#indexer/contracts/index.js";
import { EventHandler } from "#indexer/contracts/types.js";

export const getEventHandler = (
  contractName: string,
  eventName: string
): EventHandler | undefined => {
  const contractNameParts = contractName.split("/");

  if (contractNameParts.length !== 3) {
    // Invalid format, return undefined to allow fallback to legacy event handler
    // Expected format: protocol/name/version, example: AlloV1/ProjectRegistry/V2
    return undefined;
  }

  const [protocol, name, version] = contractNameParts;

  const protocolContracts = contracts[protocol as keyof typeof contracts];
  if (!protocolContracts) {
    // Protocol not found, return undefined to allow fallback to legacy event handler
    return undefined;
  }

  const nameContracts =
    protocolContracts[name as keyof typeof protocolContracts];
  if (!nameContracts) {
    // Name not found, return undefined to allow fallback to legacy event handler
    return undefined;
  }

  const contract = nameContracts[version as keyof typeof nameContracts];
  if (!contract) {
    // Version not found, return undefined to allow fallback to legacy event handler
    return undefined;
  }

  // Check for event handler within the contract version
  const eventHandler = contract.handlers?.[eventName];
  if (!eventHandler) {
    // Event handler not found, return undefined to allow fallback to legacy event handler
    return undefined;
  }

  return eventHandler;
};
