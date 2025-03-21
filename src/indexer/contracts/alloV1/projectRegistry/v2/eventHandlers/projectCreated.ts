import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "#indexer/indexer.js";
import { fullProjectId } from "#indexer/utils/fullProjectId.js";
import { EventHandler } from "#indexer/contracts/types.js";
import { parseAddress } from "#src/address.js";

export const projectCreatedHandler: EventHandler = async (
  args: EventHandlerArgs<Indexer>
) => {
  const {
    chainId,
    event,
    context: { rpcClient },
  } = args;

  // We check here the event name only to avoid type errors
  // of event.params.projectID
  //! TODO Fix it to remove the event.name check
  if (event.name === "ProjectCreated") {
    const projectId = fullProjectId(
      chainId,
      Number(event.params.projectID),
      event.address
    );

    const tx = await rpcClient.getTransaction({
      hash: event.transactionHash,
    });

    const createdBy = tx.from;

    return [
      {
        type: "InsertProject",
        project: {
          tags: ["allo-v1"],
          chainId,
          registryAddress: parseAddress(event.address),
          id: projectId,
          name: "",
          projectNumber: Number(event.params.projectID),
          metadataCid: null,
          metadata: null,
          createdByAddress: parseAddress(createdBy),
          createdAtBlock: event.blockNumber,
          updatedAtBlock: event.blockNumber,
          projectType: "canonical",
        },
      },
      {
        type: "InsertProjectRole",
        projectRole: {
          chainId,
          projectId,
          address: parseAddress(event.params.owner),
          role: "owner",
          createdAtBlock: event.blockNumber,
        },
      },
    ];
  }
  return [];
};
