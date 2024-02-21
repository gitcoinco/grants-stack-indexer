import { EventHandlerArgs } from "chainsauce";
import { keccak256, encodePacked, pad, decodeAbiParameters, Hex } from "viem";
import type { Indexer } from "../../indexer.js";
import {
  ProjectTable,
  NewRound,
  NewApplication,
  ApplicationTable,
} from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";
import { fetchPoolMetadata } from "./poolMetadata.js";
import { extractStrategyFromId } from "./strategy.js";
import { DVMDApplicationData } from "../../types.js";
import { z } from "zod";

function generateRoundRoles(poolId: bigint) {
  // POOL_MANAGER_ROLE = bytes32(poolId);
  const managerRole = pad(`0x${poolId.toString(16)}`);

  // POOL_ADMIN_ROLE = keccak256(abi.encodePacked(poolId, "admin"));
  const adminRawRole = encodePacked(["uint256", "string"], [poolId, "admin"]);
  const adminRole = keccak256(adminRawRole);
  return { managerRole, adminRole };
}

function getProjectType(metadata: object) {
  const linkedProjectMetadata = z.object({
    canonical: z.object({
      registryAddress: z.string(),
      chainId: z.coerce.number(),
    }),
  });

  if (linkedProjectMetadata.safeParse(metadata).success) {
    return "linked";
  }

  return "canonical";
}

// Decode the application data from DonationVotingMerkleDistribution
function decodeDVMDApplicationData(encodedData: Hex): DVMDApplicationData {
  const values = decodeAbiParameters(
    [
      { name: "data", type: "bytes" },
      { name: "recipientsCounter", type: "uint256" },
    ],
    encodedData
  );

  const decodedData = decodeAbiParameters(
    [
      { name: "registryAnchor", type: "address" },
      { name: "recipientAddress", type: "address" },
      {
        name: "metadata",
        type: "tuple",
        components: [
          { name: "protocol", type: "uint256" },
          { name: "pointer", type: "string" },
        ],
      },
    ],
    values[0]
  );

  const results: DVMDApplicationData = {
    recipientsCounter: values[1].toString(),
    anchorAddress: decodedData[0],
    recipientAddress: decodedData[1],
    metadata: {
      protocol: Number(decodedData[2].protocol),
      pointer: decodedData[2].pointer,
    },
  };

  return results;
}

export async function handleEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    subscribeToContract,
    readContract,
    context: { db, rpcClient, ipfsGet },
  } = args;

  switch (event.name) {
    // -- Allo V2 Profiles
    case "ProfileCreated": {
      const profileId = event.params.profileId;
      const metadataCid = event.params.metadata.pointer;
      let metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);

      // FIXME: update this when we validate all the metadata
      // for projects and rounds
      if (
        metadata === null ||
        Array.isArray(metadata) ||
        typeof metadata !== "object"
      ) {
        metadata = {};
      }

      const projectType = getProjectType(metadata as object);

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;

      const changes: Changeset[] = [
        {
          type: "InsertProject",
          project: {
            tags: ["allo-v2"],
            chainId,
            registryAddress: parseAddress(event.address),
            id: profileId,
            name: event.params.name,
            nonce: event.params.nonce,
            anchorAddress: parseAddress(event.params.anchor),
            projectNumber: null,
            metadataCid: metadataCid,
            metadata: metadata,
            createdByAddress: parseAddress(createdBy),
            createdAtBlock: event.blockNumber,
            updatedAtBlock: event.blockNumber,
            projectType,
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

      const poolId = event.params.poolId;
      const { managerRole, adminRole } = generateRoundRoles(poolId);

      const strategyAddress = event.params.strategy;

      const strategyId = await readContract({
        contract: "AlloV2/IStrategy/V1",
        address: strategyAddress,
        functionName: "getStrategyId",
      });

      const strategy = extractStrategyFromId(strategyId);

      switch (strategy?.name) {
        case "allov2.DonationVotingMerkleDistributionDirectTransferStrategy":
          subscribeToContract({
            contract:
              "AlloV2/DonationVotingMerkleDistributionDirectTransferStrategy/V1",
            address: strategyAddress,
          });
          break;
      }

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

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;

      const newRound: NewRound = {
        chainId,
        id: poolId.toString(),
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
        isReadyForPayout: false,
        createdByAddress: parseAddress(createdBy),
        createdAtBlock: event.blockNumber,
        updatedAtBlock: event.blockNumber,
        projectId: event.params.profileId,
      };

      const changes: Changeset[] = [
        {
          type: "InsertRound",
          round: newRound,
        },
      ];

      // Admin roles for the pool are emitted before the pool is created
      // so a pending round role is inserted in the db.
      // Now that the PoolCreated event is emitted, we can convert
      // pending roles to actual round roles.
      const pendingAdminRoundRoles = await db.getPendingRoundRolesByRole(
        chainId,
        adminRole
      );

      if (pendingAdminRoundRoles.length > 0) {
        for (const pr of pendingAdminRoundRoles) {
          changes.push({
            type: "InsertRoundRole",
            roundRole: {
              chainId,
              roundId: poolId.toString(),
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
      const projectType = getProjectType(metadata as object);

      return [
        {
          type: "UpdateProject",
          chainId,
          projectId: event.params.profileId,
          project: {
            metadataCid: metadataCid,
            metadata: metadata,
            projectType,
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

    case "Registered": {
      const anchorAddress = parseAddress(event.params.recipientId);
      const project = await db.getProjectByAnchor(chainId, anchorAddress);

      if (!project) {
        throw new Error("Project not found");
      }

      const encodedData = event.params.data;

      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (!round) {
        throw new Error("Round not found");
      }

      // TODO: discuss how to handle differnt decode based on round.strategyName
      const values = decodeDVMDApplicationData(encodedData);

      const metadata = await ipfsGet<ApplicationTable["metadata"]>(
        values.metadata.pointer
      );

      // -1 because the contract starts counting at 1
      const applicationIndex = (
        Number(values.recipientsCounter) - 1
      ).toString();

      const application: NewApplication = {
        chainId,
        id: applicationIndex,
        projectId: project.id,
        anchorAddress,
        roundId: round.id,
        status: "PENDING",
        metadataCid: values.metadata.pointer,
        metadata: metadata ?? null,
        createdAtBlock: event.blockNumber,
        createdByAddress: parseAddress(event.params.sender),
        statusUpdatedAtBlock: event.blockNumber,
        statusSnapshots: [
          {
            status: "PENDING",
            statusUpdatedAtBlock: event.blockNumber,
          },
        ],
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        tags: ["allo-v2"],
      };

      return [
        {
          type: "InsertApplication",
          application,
        },
      ];
    }
  }

  return [];
}
