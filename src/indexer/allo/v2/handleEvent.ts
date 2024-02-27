import { EventHandlerArgs } from "chainsauce";
import { Hex, decodeAbiParameters, encodePacked, keccak256, pad } from "viem";
import { parseAddress } from "../../../address.js";
import { Changeset } from "../../../database/index.js";
import {
  NewApplication,
  NewRound,
  ProjectTable,
} from "../../../database/schema.js";
import type { Indexer } from "../../indexer.js";
import { DGApplicationData, DGTimeStampUpdatedData, DVMDApplicationData, DVMDTimeStampUpdatedData } from "../../types.js";
import { fetchPoolMetadata } from "./poolMetadata.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";
import { extractStrategyFromId } from "./strategy.js";
import { getDateFromTimestamp } from "../../../utils/index.js";
import {
  ProjectMetadata,
  ProjectMetadataSchema,
} from "../../projectMetadata.js";

function generateRoundRoles(poolId: bigint) {
  // POOL_MANAGER_ROLE = bytes32(poolId);
  const managerRole = pad(`0x${poolId.toString(16)}`);

  // POOL_ADMIN_ROLE = keccak256(abi.encodePacked(poolId, "admin"));
  const adminRawRole = encodePacked(["uint256", "string"], [poolId, "admin"]);
  const adminRole = keccak256(adminRawRole);
  return { managerRole, adminRole };
}

function getProjectTypeFromMetadata(metadata: ProjectMetadata) {
  // if the metadata contains a canonical reference, it's a linked project
  if ("canonical" in metadata) {
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

function decodeDGApplicationData(encodedData: Hex) {
  const decodedData = decodeAbiParameters(
    [
      { name: "recipientId", type: "address" },
      { name: "registryAnchor", type: "address" },
      { name: "grantAmount", type: "uint256" },
      {
        name: "metadata",
        type: "tuple",
        components: [
          { name: "protocol", type: "uint256" },
          { name: "pointer", type: "string" },
        ],
      },
    ],
    encodedData
  );

  const results: DGApplicationData = {
    recipientAddress: decodedData[0],
    anchorAddress: decodedData[1],
    grantAmount: decodedData[2],
    metadata: {
      protocol: Number(decodedData[3].protocol),
      pointer: decodedData[3].pointer,
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
    getBlock,
    context: { db, rpcClient, ipfsGet, logger },
  } = args;

  switch (event.name) {
    // -- Allo V2 Profiles
    case "ProfileCreated": {
      const profileId = event.params.profileId;
      const metadataCid = event.params.metadata.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);

      const parsedMetadata = ProjectMetadataSchema.safeParse(metadata);

      if (parsedMetadata.success === false) {
        logger.warn({
          msg: `ProfileCreated: Failed to parse metadata for profile ${profileId}`,
          event,
          metadataCid,
          metadata,
        });
        return [];
      }

      const projectType = getProjectTypeFromMetadata(parsedMetadata.data);
      const isProgram = parsedMetadata.data.type === "program";

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;
      const programTags = isProgram ? ["program"] : [];

      const changes: Changeset[] = [
        {
          type: "InsertProject",
          project: {
            tags: ["allo-v2", ...programTags],
            chainId,
            registryAddress: parseAddress(event.address),
            id: profileId,
            name: event.params.name,
            nonce: event.params.nonce,
            anchorAddress: parseAddress(event.params.anchor),
            projectNumber: null,
            metadataCid: metadataCid,
            metadata: parsedMetadata.data,
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
        case "allov2.DirectGrantsSimpleStrategy":
          subscribeToContract({
            contract: "AlloV2/DirectGrantsSimpleStrategy/V1",
            address: strategyAddress,
          });
          break;
      }

      let applicationsStartTime: Date | null = null;
      let applicationsEndTime: Date | null = null;
      let donationsStartTime: Date | null = null;
      let donationsEndTime: Date | null = null;

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
        applicationsStartTime = getDateFromTimestamp(
          registrationStartTimeResolved
        );
        applicationsEndTime = getDateFromTimestamp(registrationEndTimeResolved);
        donationsStartTime = getDateFromTimestamp(allocationStartTimeResolved);
        donationsEndTime = getDateFromTimestamp(allocationEndTimeResolved);
      } else if (
        strategy !== null &&
        strategy.name === "allov2.DirectGrantsSimpleStrategy"
      ) {
        const contract = "AlloV2/DirectGrantsSimpleStrategy/V1";
        const [registrationStartTimeResolved, registrationEndTimeResolved] =
          await Promise.all([
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
          ]);
        applicationsStartTime = getDateFromTimestamp(
          registrationStartTimeResolved
        );
        applicationsEndTime = getDateFromTimestamp(registrationEndTimeResolved);
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
        applicationsStartTime: applicationsStartTime,
        applicationsEndTime: applicationsEndTime,
        donationsStartTime: donationsStartTime,
        donationsEndTime: donationsEndTime,
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
            anchorAddress: parseAddress(event.params.anchor),
          },
        },
      ];
    }

    case "ProfileMetadataUpdated": {
      const metadataCid = event.params.metadata.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);
      const parsedMetadata = ProjectMetadataSchema.safeParse(metadata);

      if (!parsedMetadata.success) {
        logger.warn({
          msg: `ProfileMetadataUpdated: Failed to parse metadata`,
          event,
          metadataCid,
          metadata,
        });
        return [];
      }

      const projectType = getProjectTypeFromMetadata(parsedMetadata.data);

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

    // -- Allo V2 Strategies
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

      let id;
      let values;

      switch (round.strategyName) {
        case "allov2.DirectGrantsSimpleStrategy":
          values = decodeDGApplicationData(encodedData);
          id = event.params.recipientId;
          break;

        case "allov2.DonationVotingMerkleDistributionDirectTransferStrategy":
          values = decodeDVMDApplicationData(encodedData);
          id = (Number(values.recipientsCounter) - 1).toString();
          break;

        default:
          throw new Error("Invalid strategy name");
      }

      const metadata = await ipfsGet(values.metadata.pointer);

      const { timestamp } = await getBlock();

      const application: NewApplication = {
        chainId,
        id: id,
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
            updatedAtBlock: event.blockNumber.toString(),
            updatedAt: new Date(timestamp * 1000),
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

    case "TimestampsUpdated": {
      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (!round) {
        throw new Error("Round not found");
      }

      let applicationsStartTime: Date | null = null;
      let applicationsEndTime: Date | null = null;
      let donationsStartTime: Date | null = null;
      let donationsEndTime: Date | null = null;
      let params;

      switch (round.strategyName) {
        case "allov2.DirectGrantsSimpleStrategy":
          params = event.params as DGTimeStampUpdatedData;

          applicationsStartTime = getDateFromTimestamp(
            params.registrationStartTime
          );
          applicationsEndTime = getDateFromTimestamp(
            params.registrationEndTime
          );

          break;

        case "allov2.DonationVotingMerkleDistributionDirectTransferStrategy":

          params = event.params as DVMDTimeStampUpdatedData;

          applicationsStartTime = getDateFromTimestamp(
            params.registrationStartTime
          );
          applicationsEndTime = getDateFromTimestamp(
            params.registrationEndTime
          );
          donationsStartTime = getDateFromTimestamp(
            params.allocationStartTime!
          );
          donationsEndTime = getDateFromTimestamp(
            params.allocationEndTime
          );

          break;

        default:
          throw new Error("Invalid strategy name");
      }

      return [
        {
          type: "UpdateRound",
          chainId,
          roundId: round.id,
          round: {
            applicationsStartTime,
            applicationsEndTime,
            donationsStartTime,
            donationsEndTime,
          },
        },
      ];

    }
  }

  return [];
}
