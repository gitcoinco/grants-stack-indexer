import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { ProjectTable, NewRound } from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import { parseHex } from "../../../hex.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";
import { fetchPoolMetadata } from "./parsePoolMetadata.js";

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
            projectNumber: null,
            metadataCid: metadataCid,
            metadata: metadata,
            createdAtBlock: event.blockNumber,
            updatedAtBlock: event.blockNumber,
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

      const pendingProjectRoles = await db.getPendingProjectRolesByRole(
        chainId,
        profileId
      );

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

        changes.push({
          type: "DeletePendingProjectRoles",
          ids: pendingProjectRoles.map((r) => r.id!),
        });
      }

      return changes;
    }

    case "PoolCreated": {
      const applicationsStartTime = new Date();
      const applicationsEndTime = new Date();
      const donationsStartTime = new Date();
      const donationsEndTime = new Date();

      const { pointer: metadataPointer } = event.params.metadata;
      const { roundMetadata, applicationMetadata } = await fetchPoolMetadata(
        ipfsGet,
        metadataPointer
      );

      const newRound: NewRound = {
        chainId,
        id: parseHex(event.params.poolId.toString()),
        tags: ["allo-v2"],
        totalDonationsCount: 0,
        totalAmountDonatedInUsd: 0,
        uniqueDonorsCount: 0,
        matchTokenAddress: parseAddress(event.params.token),
        matchAmount: event.params.amount,
        matchAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: applicationMetadata ?? {},
        roundMetadataCid: "",
        roundMetadata: roundMetadata ?? {},
        applicationsStartTime: isNaN(applicationsStartTime.getTime())
          ? null
          : applicationsStartTime,
        applicationsEndTime: isNaN(applicationsEndTime.getTime())
          ? null
          : applicationsEndTime,
        donationsStartTime: isNaN(donationsStartTime.getTime())
          ? null
          : donationsStartTime,
        donationsEndTime: isNaN(donationsEndTime.getTime())
          ? null
          : donationsEndTime,
        managerRole: "",
        adminRole: "",
        createdAtBlock: event.blockNumber,
        updatedAtBlock: event.blockNumber,
      };

      return [
        {
          type: "InsertRound",
          round: newRound,
        },
      ];
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
