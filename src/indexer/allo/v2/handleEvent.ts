import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../../indexer.js";
import { ProjectTable } from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";

export async function handleEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { ipfsGet },
  } = args;

  switch (event.name) {
    // -- Allo V2 Profiles
    case "ProfileCreated": {
      const metadataCid = event.params.metadata.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);
      return [
        {
          type: "InsertProject",
          project: {
            tags: ["allo-v2"],
            chainId,
            registryAddress: parseAddress(event.address),
            id: event.params.profileId,
            projectNumber: 0,
            metadataCid: metadataCid,
            metadata: metadata,
            ownerAddresses: [parseAddress(event.params.owner)],
            createdAtBlock: event.blockNumber,
          },
        },
      ];
    }
  }

  return [];
}
