import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { ProjectTable } from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";

export async function handleEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { db, ipfsGet },
  } = args;

  switch (event.name) {
    // -- Allo V2 Profiles
    case "ProfileCreated": {
      const profileId = event.params.profileId;
      const metadataCid = event.params.metadata.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);
      const changes: Changeset[] = [
        {
          type: "InsertProject",
          project: {
            tags: ["allo-v2"],
            chainId,
            registryAddress: parseAddress(event.address),
            id: profileId,
            name: event.params.name,
            projectNumber: 0,
            metadataCid: metadataCid,
            metadata: metadata,
            createdAtBlock: event.blockNumber,
          },
        },
        {
          type: "InsertProjectRole",
          projectRole: {
            chainId,
            projectId: event.params.profileId,
            address: parseAddress(event.params.owner),
            role: "owner",
            createdAtBlock: event.blockNumber,
          },
        },
      ];

      const pendingProjectRoles =
        await db.getPendingProjectRolesByRole(profileId);

      if (pendingProjectRoles.length !== 0) {
        for (const role of pendingProjectRoles) {
          changes.push({
            type: "InsertProjectRole",
            projectRole: {
              chainId,
              projectId: profileId,
              address: parseAddress(role.address),
              role: "member",
              createdAtBlock: event.blockNumber,
            },
          });
        }
      }

      return changes;
    }

    case "RoleGranted": {
      return await roleGranted({ ...args, event });
    }

    case "RoleRevoked": {
      return await roleRevoked({ ...args, event });
    }

    case "ProfileNameUpdated": {
      return [
        {
          type: "UpdateProject",
          chainId,
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
          chainId,
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
          type: "DeleteAllProjectRolesByRole",
          projectRole: {
            chainId,
            projectId: event.params.profileId,
            role: "owner",
          },
        },
        {
          type: "InsertProjectRole",
          projectRole: {
            chainId,
            projectId: event.params.profileId,
            address: parseAddress(event.params.owner),
            role: "owner",
            createdAtBlock: event.blockNumber,
          },
        },
      ];
    }
  }

  return [];
}
