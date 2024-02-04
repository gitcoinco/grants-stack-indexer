import { EventHandlerArgs } from "chainsauce";
import { ethers } from "ethers";
import type { Indexer } from "../../indexer.js";
import { ProjectTable, NewRound } from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";
import { fetchPoolMetadata } from "./parsePoolMetadata.js";
import { extractStrategyFromId } from "./strategy.js";

function padBytes32Hex(s: string): string {
  if (s.length > 64) {
    return s;
  }

  const padding = 64 - s.length;
  let hex = s;
  hex = "0".repeat(padding) + hex;
  return "0x" + hex;
}

function generateRoundRoles(poolId: string) {
  // POOL_MANAGER_ROLE = bytes32(poolId);
  const managerRole = padBytes32Hex(poolId);

  // POOL_ADMIN_ROLE = keccak256(abi.encodePacked(poolId, "admin"));
  const adminRawRole = ethers.utils.solidityPack(
    ["uint256", "string"],
    [poolId, "admin"]
  );
  const adminRole = ethers.utils.solidityKeccak256(["bytes"], [adminRawRole]);
  return { managerRole, adminRole };
}

export async function handleEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    readContract,
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
      const { pointer: metadataPointer } = event.params.metadata;
      const { roundMetadata, applicationMetadata } = await fetchPoolMetadata(
        ipfsGet,
        metadataPointer
      );

      const poolId = event.params.poolId.toString();
      const { managerRole, adminRole } = generateRoundRoles(poolId);

      const strategyAddress = event.params.strategy;

      const strategyId = await readContract({
        contract: "AlloV2/IStrategy/V1",
        address: strategyAddress,
        functionName: "getStrategyId",
      });

      const strategy = extractStrategyFromId(strategyId);

      let applicationsStartTime = new Date();
      let applicationsEndTime = new Date();
      let donationsStartTime = new Date();
      let donationsEndTime = new Date();

      if (
        strategy !== null &&
        strategy.name ===
          "allov2.DonationVotingMerkleDistributionDirectTransferStrategy"
      ) {
        const contract =
          "AlloV2/DonationVotingMerkleDistributionDirectTransferStrategy/V1";
        const [
          registrationStartTimeResolved,
          registrationEndTimeResolved,
          allocationStartTimeResolved,
          allocationEndTimeResolved,
        ] = await Promise.all([
          await readContract({
            contract,
            address: strategyAddress,
            functionName: "registrationStartTime",
          }),
          await readContract({
            contract,
            address: strategyAddress,
            functionName: "registrationEndTime",
          }),
          await readContract({
            contract,
            address: strategyAddress,
            functionName: "allocationStartTime",
          }),
          await readContract({
            contract,
            address: strategyAddress,
            functionName: "allocationEndTime",
          }),
        ]);
        applicationsStartTime = new Date(
          Number(registrationStartTimeResolved) * 1000
        );
        applicationsEndTime = new Date(
          Number(registrationEndTimeResolved) * 1000
        );
        donationsStartTime = new Date(
          Number(allocationStartTimeResolved) * 1000
        );
        donationsEndTime = new Date(Number(allocationEndTimeResolved) * 1000);
      }

      const newRound: NewRound = {
        chainId,
        id: poolId,
        tags: ["allo-v2"],
        totalDonationsCount: 0,
        totalAmountDonatedInUsd: 0,
        uniqueDonorsCount: 0,
        matchTokenAddress: parseAddress(event.params.token),
        matchAmount: event.params.amount,
        matchAmountInUsd: 0,
        applicationMetadataCid: metadataPointer,
        applicationMetadata: applicationMetadata ?? {},
        roundMetadataCid: metadataPointer,
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
        managerRole,
        adminRole,
        strategyAddress: parseAddress(strategyAddress),
        strategyId,
        strategyName: strategy?.name ?? "",
        createdAtBlock: event.blockNumber,
        updatedAtBlock: event.blockNumber,
      };

      const changes: Changeset[] = [
        {
          type: "InsertRound",
          round: newRound,
        },
      ];

      const pendingRoundRoles = await db.getPendingRoundRolesByRole(
        chainId,
        adminRole
      );

      if (pendingRoundRoles.length > 0) {
        for (const pr of pendingRoundRoles) {
          changes.push({
            type: "InsertRoundRole",
            roundRole: {
              chainId,
              roundId: poolId,
              address: pr.address,
              role: "admin",
              createdAtBlock: event.blockNumber,
            },
          });
        }

        changes.push({
          type: "DeletePendingRoundRoles",
          ids: pendingAdminRoundRoles.map((r) => r.id!),
        });
      }

      // Manager roles for the pool are emitted before the pool is created
      // so a pending round role is inserted in the db.
      // Now that the PoolCreated event is emitted, we can convert
      // pending roles to actual round roles.
      const pendingManagerRoundRoles = await db.getPendingRoundRolesByRole(
        chainId,
        managerRole
      );

      if (pendingManagerRoundRoles.length > 0) {
        for (const pr of pendingManagerRoundRoles) {
          changes.push({
            type: "InsertRoundRole",
            roundRole: {
              chainId,
              roundId: poolId.toString(),
              address: pr.address,
              role: "manager",
              createdAtBlock: event.blockNumber,
            },
          });
        }

        changes.push({
          type: "DeletePendingRoundRoles",
          ids: pendingManagerRoundRoles.map((r) => r.id!),
        });
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
