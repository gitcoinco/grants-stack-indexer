import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { ProjectTable } from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";

export const Roles = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  owner: "0x815b5a78dc333d344c7df9da23c04dbd432015cc701876ddb9ffe850e6882747",
  // member role is the profileId
};

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
            name: event.params.name,
            projectNumber: 0,
            metadataCid: metadataCid,
            metadata: metadata,
            ownerAddresses: [parseAddress(event.params.owner)],
            createdAtBlock: event.blockNumber,
          },
        },
      ];
    }

    case "ProfileNameUpdated": {
      return [
        {
          type: "UpdateProject",
          projectId: event.params.profileId,
          project: {
            name: event.params.name,
          },
        },
      ];
    }

    case "ProfileMetadataUpdated": {
      const metadataCid = event.params.metadata.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);
      return [
        {
          type: "UpdateProject",
          projectId: event.params.profileId,
          project: {
            metadataCid: metadataCid,
            metadata: metadata,
          },
        },
      ];
    }

    case "ProfileOwnerUpdated": {
      return [
        {
          type: "UpdateProject",
          projectId: event.params.profileId,
          project: {
            ownerAddresses: [parseAddress(event.params.owner)],
          },
        },
      ];
    }
  }

  return [];
}
