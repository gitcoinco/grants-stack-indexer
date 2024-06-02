import { EventHandlerArgs } from "chainsauce";
import { Indexer } from "@/indexer/indexer.js";
import { Changeset } from "@/database/index.js";
import { fullProjectId } from "@/indexer/allo/v1/project.js";
import { parseAddress } from "@/address.js";

export default async function (
  args: EventHandlerArgs<Indexer, "AlloV1/ProjectRegistry/V2", "ProjectCreated">
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
