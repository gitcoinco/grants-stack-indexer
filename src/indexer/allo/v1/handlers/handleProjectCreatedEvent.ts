import { EventHandlerArgs } from "chainsauce";
import { parseAddress } from "../../../../address.js";
import { fullProjectId } from "../fullProjectId.js";
import type { Indexer } from "../../../indexer.js";
import type { Changeset } from "../../../../database/index.js";

export async function handleProjectCreatedEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV1/ProjectRegistry/V1" | "AlloV1/ProjectRegistry/V2",
    "ProjectCreated"
  >
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { rpcClient },
  } = args;

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
