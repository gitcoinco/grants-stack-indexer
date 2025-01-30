import { EventHandlerArgs } from "chainsauce";
import {
  Hex,
  decodeAbiParameters,
  encodePacked,
  keccak256,
  pad,
  parseUnits,
  zeroAddress,
} from "viem";
import { parseAddress } from "../../../address.js";
import { Changeset } from "../../../database/index.js";
import {
  ApplicationTable,
  Donation,
  ERFDistributionSchema,
  MatchingDistributionSchema,
  NewApplication,
  NewRound,
  ProjectTable,
  ProjectType,
} from "../../../database/schema.js";
import type { Indexer } from "../../indexer.js";
import {
  DGApplicationData,
  DGTimeStampUpdatedData,
  DVMDApplicationData,
  DVMDExtendedApplicationData,
  DVMDTimeStampUpdatedData,
  EasyRetroFundingTimeStampUpdatedData,
} from "../../types.js";
import { fetchPoolMetadata } from "./poolMetadata.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";
import { extractStrategyFromId } from "./strategy.js";
import { getDateFromTimestamp } from "../../../utils/index.js";
import {
  ProjectMetadata,
  ProjectMetadataSchema,
} from "../../projectMetadata.js";
import StatusesBitmap from "statuses-bitmap";
import { updateApplicationStatus } from "../application.js";
import { convertFromUSD, convertToUSD } from "../../../prices/provider.js";
import { RoundMetadataSchema } from "../roundMetadata.js";
import { getTokenForChain } from "../../../config.js";
import { ethers } from "ethers";
import { UnknownTokenError } from "../../../prices/common.js";
import { ApplicationMetadataSchema } from "../../applicationMetadata.js";

const ALLO_NATIVE_TOKEN = parseAddress(
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
);

const addressZero = "0x0000000000000000000000000000000000000000";

enum ApplicationStatus {
  NONE = 0,
  PENDING,
  APPROVED,
  REJECTED,
  CANCELLED,
  IN_REVIEW,
}

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
function decodeDVMDExtendedApplicationData(
  encodedData: Hex
): DVMDExtendedApplicationData {
  const values = decodeAbiParameters(
    [
      { name: "data", type: "bytes" },
      { name: "recipientsCounter", type: "uint256" },
    ],
    encodedData
  );

  const encodededDVMD = decodeDVMDApplicationData(values[0]);

  return {
    ...encodededDVMD,
    recipientsCounter: values[1].toString(),
  };
}

function decodeDVMDApplicationData(encodedData: Hex): DVMDApplicationData {
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
    encodedData
  );

  const results: DVMDApplicationData = {
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
    context: {
      db,
      rpcClient,
      ipfsGet,
      logger,
      priceProvider,
      blockTimestampInMs,
    },
  } = args;

  switch (event.name) {
    // -- Allo V2 Profiles
    case "ProfileCreated": {
      const profileId = event.params.profileId;
      const metadataCid = event.params.metadata.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);

      const parsedMetadata = ProjectMetadataSchema.safeParse(metadata);

      let projectType: ProjectType = "canonical";
      let isProgram = false;
      let metadataValue = null;

      if (parsedMetadata.success) {
        projectType = getProjectTypeFromMetadata(parsedMetadata.data);
        isProgram = parsedMetadata.data.type === "program";
        metadataValue = parsedMetadata.data;
      } else {
        logger.warn({
          msg: `ProfileCreated: Failed to parse metadata for profile ${profileId}`,
          event,
          metadataCid,
          // metadata,
        });
      }

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
            metadata: metadataValue,
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

      const parsedMetadata = RoundMetadataSchema.safeParse(roundMetadata);

      const poolId = event.params.poolId;

      const { managerRole, adminRole } = generateRoundRoles(poolId);

      const strategyAddress = event.params.strategy;

      const strategyId = await readContract({
        contract: "AlloV2/IStrategy/V1",
        address: strategyAddress,
        functionName: "getStrategyId",
      });

      const strategy = extractStrategyFromId(strategyId);

      let matchAmount = 0n;
      let matchAmountInUsd = 0;

      let matchTokenAddress = parseAddress(event.params.token);

      if (matchTokenAddress === ALLO_NATIVE_TOKEN) {
        matchTokenAddress = parseAddress(zeroAddress);
      }

      const token = getTokenForChain(chainId, matchTokenAddress);

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
        case "allov2.DirectGrantsLiteStrategy":
          subscribeToContract({
            contract: "AlloV2/DirectGrantsLiteStrategy/V1",
            address: strategyAddress,
          });
          break;
        case "allov2.EasyRPGFStrategy":
          subscribeToContract({
            contract: "AlloV2/EasyRPGFStrategy/V1",
            address: strategyAddress,
          });
          break;
        case "allov2.DirectAllocationStrategy":
          subscribeToContract({
            contract: "AlloV2/DirectAllocationStrategy/V1",
            address: strategyAddress,
          });
          break;
        case "allov2.EasyRetroFundingStrategy":
          subscribeToContract({
            contract: "AlloV2/EasyRetroFundingStrategy/V1",
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

        if (parsedMetadata.success && token !== null) {
          matchAmount = parseUnits(
            parsedMetadata.data.quadraticFundingConfig.matchingFundsAvailable.toString(),
            token.decimals
          );

          matchAmountInUsd = (
            await convertToUSD(
              priceProvider,
              chainId,
              matchTokenAddress,
              matchAmount,
              event.blockNumber
            )
          ).amount;
        }
      } else if (
        strategy !== null &&
        (strategy.name === "allov2.DirectGrantsSimpleStrategy" ||
          strategy.name === "allov2.DirectGrantsLiteStrategy")
      ) {
        const contract =
          strategy.name === "allov2.DirectGrantsSimpleStrategy"
            ? "AlloV2/DirectGrantsSimpleStrategy/V1"
            : "AlloV2/DirectGrantsLiteStrategy/V1";

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
      } else if (
        strategy !== null &&
        strategy.name === "allov2.EasyRetroFundingStrategy"
      ) {
        const contract = "AlloV2/EasyRetroFundingStrategy/V1";

        const [
          registrationStartTimeResolved,
          registrationEndTimeResolved,
          poolStartTimeResolved,
          poolEndTimeResolved,
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
            functionName: "poolStartTime",
          }),
          await readContract({
            contract,
            address: strategyAddress,
            functionName: "poolEndTime",
          }),
        ]);

        applicationsStartTime = getDateFromTimestamp(
          registrationStartTimeResolved
        );
        applicationsEndTime = getDateFromTimestamp(registrationEndTimeResolved);
        donationsStartTime = getDateFromTimestamp(poolStartTimeResolved);
        donationsEndTime = getDateFromTimestamp(poolEndTimeResolved);

        if (parsedMetadata.success && token !== null) {
          matchAmount = parseUnits(
            parsedMetadata.data.quadraticFundingConfig.matchingFundsAvailable.toString(),
            token.decimals
          );
          matchAmountInUsd = (
            await convertToUSD(
              priceProvider,
              chainId,
              matchTokenAddress,
              matchAmount,
              event.blockNumber
            )
          ).amount;
        }
      }

      const fundedAmount = event.params.amount;
      let fundedAmountInUsd = 0;

      if (token !== null && fundedAmount > 0n) {
        fundedAmountInUsd = (
          await convertToUSD(
            priceProvider,
            chainId,
            matchTokenAddress,
            fundedAmount,
            event.blockNumber
          )
        ).price;
      }

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;

      const newRound: NewRound = {
        chainId,
        id: poolId.toString(),
        tags: ["allo-v2", ...(parsedMetadata.success ? ["grants-stack"] : [])],
        totalDonationsCount: 0,
        totalAmountDonatedInUsd: 0,
        uniqueDonorsCount: 0,
        matchTokenAddress,
        matchAmount,
        matchAmountInUsd,
        fundedAmount,
        fundedAmountInUsd,
        applicationMetadataCid: metadataPointer,
        applicationMetadata: applicationMetadata ?? {},
        roundMetadataCid: metadataPointer,
        roundMetadata: roundMetadata ?? null,
        applicationsStartTime: applicationsStartTime,
        applicationsEndTime: applicationsEndTime,
        donationsStartTime: donationsStartTime,
        donationsEndTime: donationsEndTime,
        managerRole,
        adminRole,
        strategyAddress: parseAddress(strategyAddress),
        strategyId,
        strategyName: strategy?.name ?? "",
        createdByAddress: parseAddress(createdBy),
        createdAtBlock: event.blockNumber,
        updatedAtBlock: event.blockNumber,
        projectId: event.params.profileId,
        totalDistributed: 0n,
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

    case "PoolFunded": {
      const poolId = event.params.poolId.toString();
      const fundedAmount = event.params.amount;

      const round = await db.getRoundById(chainId, poolId);

      if (round === null) {
        return [];
      }

      const { amount: fundedAmountInUsd } = await convertToUSD(
        priceProvider,
        round.chainId,
        round.matchTokenAddress,
        fundedAmount,
        event.blockNumber
      );

      return [
        {
          type: "IncrementRoundFundedAmount",
          roundId: round.id,
          chainId: round.chainId,
          fundedAmount,
          fundedAmountInUsd,
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

    case "RecipientStatusUpdated": {
      const strategyAddress = parseAddress(event.address);

      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (round === null) {
        logger.warn({
          msg: `RecipientStatusUpdated: Round not found for strategy address`,
          event,
          strategyAddress,
        });
        return [];
      }

      const bitmap = new StatusesBitmap(256n, 4n);
      bitmap.setRow(event.params.rowIndex, event.params.fullRow);
      const startIndex = event.params.rowIndex * bitmap.itemsPerRow;

      const indexes = [];

      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        indexes.push(i);
      }

      // TODO: batch update
      return (
        await Promise.all(
          indexes.map(async (i) => {
            const status = bitmap.getStatus(i);

            if (status < 1 || status > 5) {
              return [];
            }

            const statusString = ApplicationStatus[
              status
            ] as ApplicationTable["status"];
            const applicationId = i.toString();

            const application = await db.getApplicationById(
              chainId,
              round.id,
              applicationId
            );

            if (application === null) {
              return [];
            }

            return [
              {
                type: "UpdateApplication",
                chainId,
                roundId: round.id,
                applicationId: i.toString(),
                application: await updateApplicationStatus(
                  application,
                  statusString,
                  event.blockNumber,
                  getBlock
                ),
              } satisfies Changeset,
            ];
          })
        )
      ).flat();
    }

    // -- Allo V2 Core
    case "PoolMetadataUpdated": {
      const { pointer: metadataPointer } = event.params.metadata;
      const { roundMetadata, applicationMetadata } = await fetchPoolMetadata(
        ipfsGet,
        metadataPointer
      );

      const round = await db.getRoundById(
        chainId,
        event.params.poolId.toString()
      );

      if (round === null) {
        return [];
      }

      let matchAmount = round.matchAmount;
      let matchAmountInUsd = round.matchAmountInUsd;

      const parsedMetadata = RoundMetadataSchema.safeParse(roundMetadata);
      const token = getTokenForChain(chainId, round.matchTokenAddress);

      if (parsedMetadata.success && token !== null) {
        matchAmount = parseUnits(
          parsedMetadata.data.quadraticFundingConfig.matchingFundsAvailable.toString(),
          token.decimals
        );
        matchAmountInUsd = (
          await convertToUSD(
            priceProvider,
            chainId,
            round.matchTokenAddress,
            matchAmount,
            event.blockNumber
          )
        ).amount;
      }

      return [
        {
          type: "UpdateRound",
          chainId,
          roundId: event.params.poolId.toString(),
          round: {
            applicationMetadataCid: metadataPointer,
            applicationMetadata: applicationMetadata ?? {},
            roundMetadataCid: metadataPointer,
            roundMetadata: roundMetadata ?? {},
            matchAmount,
            matchAmountInUsd,
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
        case "allov2.DirectGrantsLiteStrategy":
        case "allov2.EasyRetroFundingStrategy":
          values = decodeDVMDExtendedApplicationData(encodedData);
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
        distributionTransaction: null,
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

    case "UpdatedRegistration": {
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

      let values;

      switch (round.strategyName) {
        case "allov2.DirectGrantsSimpleStrategy":
          values = decodeDGApplicationData(encodedData);
          break;

        case "allov2.DirectGrantsLiteStrategy":
        case "allov2.DonationVotingMerkleDistributionDirectTransferStrategy":
        case "allov2.EasyRetroFundingStrategy":
          values = decodeDVMDApplicationData(encodedData);
          break;

        default:
          throw new Error("Invalid strategy name");
      }

      const metadata = await ipfsGet(values.metadata.pointer);

      const statusString = ApplicationStatus[
        event.params.status
      ] as ApplicationTable["status"];

      const application = await db.getApplicationByAnchorAddress(
        chainId,
        round.id,
        anchorAddress
      );

      if (application === null) {
        return [];
      }

      const statusUpdates = await updateApplicationStatus(
        application,
        statusString,
        event.blockNumber,
        getBlock
      );

      return [
        {
          type: "UpdateApplication",
          chainId,
          roundId: round.id,
          applicationId: application.id,
          application: {
            ...application,
            ...statusUpdates,
            metadataCid: values.metadata.pointer,
            metadata: metadata ?? null,
          },
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
        case "allov2.DirectGrantsLiteStrategy":
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
          donationsStartTime = getDateFromTimestamp(params.allocationStartTime);
          donationsEndTime = getDateFromTimestamp(params.allocationEndTime);

          break;

        case "allov2.EasyRetroFundingStrategy":
          params = event.params as EasyRetroFundingTimeStampUpdatedData;

          applicationsStartTime = getDateFromTimestamp(
            params.registrationStartTime
          );
          applicationsEndTime = getDateFromTimestamp(
            params.registrationEndTime
          );
          donationsStartTime = getDateFromTimestamp(params.poolStartTime);
          donationsEndTime = getDateFromTimestamp(params.poolEndTime);
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

    case "DistributionUpdated": {
      // FIXME: chinsauce should narrow the type based on the contract name
      if (!("metadata" in event.params)) {
        return [];
      }
      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (!round) {
        throw new Error("Round not found");
      }

      const rawDistribution = (await ipfsGet(
        event.params.metadata.pointer
      )) as Record<string, unknown>;

      const blockNumber = Number(event.blockNumber);
      const blockTimestamp =
        getDateFromTimestamp(
          BigInt((await blockTimestampInMs(chainId, event.blockNumber)) / 1000)
        ) || undefined;
      let distribution;
      switch (round.strategyName) {
        case "allov2.EasyRetroFundingStrategy": {
          rawDistribution["blockNumber"] = blockNumber;
          rawDistribution["blockTimestamp"] = blockTimestamp;
          const parsedDistribution =
            ERFDistributionSchema.safeParse(rawDistribution);

          const enhancedMatchingDistribution = parsedDistribution.success
            ? parsedDistribution.data?.matchingDistribution.map((entry) => ({
                ...entry,
                contributionsCount: 0,
                originalMatchAmountInToken: "0",
                matchAmountInToken: "0",
              }))
            : [];

          distribution = {
            data: {
              matchingDistribution: enhancedMatchingDistribution,
              blockNumber: blockNumber,
              blockTimestamp: blockTimestamp,
              usdPrice: 0,
              usdPriceTimestampAt: undefined,
            },
            success: parsedDistribution.success,
          };
          break;
        }
        default: {
          const usdAmount = await convertToUSD(
            priceProvider,
            chainId,
            round?.matchTokenAddress,
            BigInt(1),
            event.blockNumber
          );

          rawDistribution["blockNumber"] = blockNumber;
          rawDistribution["blockTimestamp"] = blockTimestamp;
          rawDistribution["usdPrice"] = usdAmount.price;
          rawDistribution["usdPriceTimestampAt"] = usdAmount.timestamp;

          distribution = MatchingDistributionSchema.safeParse(rawDistribution);
          break;
        }
      }

      if (!distribution || !distribution.success) {
        logger.warn({
          msg: "Failed to parse distribution",
          error: distribution?.error,
          event,
          rawDistribution,
        });
        return [];
      }

      return [
        {
          type: "UpdateRoundByStrategyAddress",
          chainId,
          strategyAddress,
          round: {
            readyForPayoutTransaction: event.transactionHash,
            matchingDistribution: distribution.data,
          },
        },
      ];
    }

    case "FundsDistributed": {
      if (!("recipientId" in event.params)) {
        return [];
      }

      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (round === null) {
        return [];
      }

      const roundId = round.id;
      const anchorAddress = parseAddress(event.params.recipientId);
      const application = await db.getApplicationByAnchorAddress(
        chainId,
        roundId,
        anchorAddress
      );

      if (application === null) {
        return [];
      }

      return [
        {
          type: "UpdateApplication",
          chainId,
          roundId,
          applicationId: application.id,
          application: {
            distributionTransaction: event.transactionHash,
          },
        },
        {
          type: "IncrementRoundTotalDistributed",
          chainId,
          roundId: round.id,
          amount: BigInt(event.params.amount),
        },
      ];
    }

    case "Distributed": {
      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (round === null) {
        return [];
      }

      return [
        {
          type: "IncrementRoundTotalDistributed",
          chainId,
          roundId: round.id,
          amount: BigInt(event.params.amount),
        },
      ];
    }

    case "ProfileMigrated": {
      const alloV1ProfileId = event.params.alloV1;
      const alloV2ProfileId = event.params.alloV2;

      return [
        {
          type: "NewLegacyProject",
          legacyProject: {
            v1ProjectId: alloV1ProfileId,
            v2ProjectId: alloV2ProfileId,
          },
        },
      ];
    }

    case "Allocated": {
      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      if (round === null) {
        return [];
      }

      switch (round.strategyName) {
        case "allov2.DonationVotingMerkleDistributionDirectTransferStrategy": {
          if (!("origin" in event.params)) {
            return [];
          }

          const recipientId = parseAddress(event.params.recipientId);
          const amount = event.params.amount;
          const token = parseAddress(event.params.token);
          const origin = parseAddress(event.params.origin);

          const application = await db.getApplicationByAnchorAddress(
            chainId,
            round.id,
            recipientId
          );

          const roundMatchTokenAddress = round.matchTokenAddress;

          if (application === null) {
            return [];
          }

          const donationId = ethers.utils.solidityKeccak256(
            ["string"],
            [`${event.blockNumber}-${event.logIndex}`]
          );

          const conversionToUSD = await convertToUSD(
            priceProvider,
            chainId,
            token,
            event.params.amount,
            event.blockNumber
          );

          const amountInUsd = conversionToUSD.amount;

          let amountInRoundMatchToken: bigint | null = null;
          try {
            amountInRoundMatchToken =
              roundMatchTokenAddress === token
                ? event.params.amount
                : (
                    await convertFromUSD(
                      priceProvider,
                      chainId,
                      roundMatchTokenAddress,
                      amountInUsd,
                      event.blockNumber
                    )
                  ).amount;
          } catch (err) {
            if (err instanceof UnknownTokenError) {
              logger.warn({
                msg: `Skipping event ${event.name} on chain ${chainId} due to unknown token ${roundMatchTokenAddress}`,
                err,
                event,
              });
              return [];
            } else {
              throw err;
            }
          }
          const parsedMetadata = ApplicationMetadataSchema.safeParse(
            application.metadata
          );

          if (parsedMetadata.success === false) {
            logger.warn({
              msg: `Application: Failed to parse metadata for application ${application.id}`,
              event,
            });
            return [];
          }

          const donation: Donation = {
            id: donationId,
            chainId,
            roundId: round.id,
            applicationId: application.id,
            donorAddress: origin,
            recipientAddress: parseAddress(
              parsedMetadata.data.application.recipient
            ),
            projectId: application.projectId,
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            tokenAddress: token,
            amount: amount,
            amountInUsd,
            amountInRoundMatchToken,
            timestamp: conversionToUSD.timestamp,
          };

          return [
            {
              type: "InsertDonation",
              donation,
            },
          ];
        }

        case "allov2.DirectGrantsLiteStrategy": {
          const recipientId = parseAddress(event.params.recipientId);
          const amount = event.params.amount;
          const tokenAddress = parseAddress(event.params.token);
          const roundId = round.id;
          const application = await db.getApplicationByAnchorAddress(
            chainId,
            roundId,
            recipientId
          );

          let amountInUsd = 0;
          let amountInRoundMatchToken = 0n;

          try {
            amountInUsd = (
              await convertToUSD(
                priceProvider,
                chainId,
                tokenAddress,
                amount,
                event.blockNumber
              )
            ).amount;

            amountInRoundMatchToken = (
              await convertFromUSD(
                priceProvider,
                chainId,
                tokenAddress,
                amountInUsd,
                event.blockNumber
              )
            ).amount;
          } catch (error) {
            logger.warn({
              msg: "Token not found: Failed to convert amount to USD",
              error,
              event,
            });
          }
          const timestamp = getDateFromTimestamp(
            BigInt(
              (await blockTimestampInMs(chainId, event.blockNumber)) / 1000
            )
          );

          return [
            {
              type: "InsertApplicationPayout",
              payout: {
                amount,
                applicationId: application?.id!,
                roundId,
                chainId,
                tokenAddress,
                amountInRoundMatchToken,
                amountInUsd,
                transactionHash: event.transactionHash,
                sender: parseAddress(event.params.sender),
                timestamp,
              },
            },
          ];
        }

        default: {
          logger.warn({
            msg: `Unsupported strategy ${round.strategyName}`,
            event,
          });

          return [];
        }
      }
    }

    case "DirectAllocated": {
      const strategyAddress = parseAddress(event.address);
      const round = await db.getRoundByStrategyAddress(
        chainId,
        strategyAddress
      );

      const profile = await db.getProjectById(chainId, event.params.profileId);

      if (profile === null || round === null) {
        return [];
      }

      const donationId = ethers.utils.solidityKeccak256(
        ["string"],
        [`${event.blockNumber}-${event.logIndex}`]
      );

      const amount = event.params.amount;
      const token = parseAddress(event.params.token);
      const sender = parseAddress(event.params.sender);

      const conversionToUSD = await convertToUSD(
        priceProvider,
        chainId,
        token,
        event.params.amount,
        event.blockNumber
      );

      const amountInUsd = conversionToUSD.amount;

      const donation: Donation = {
        id: donationId,
        chainId,
        roundId: round.id,
        applicationId: parseAddress(addressZero),
        donorAddress: sender,
        recipientAddress: parseAddress(event.params.profileOwner),
        projectId: event.params.profileId,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        tokenAddress: token,
        amount: amount,
        amountInUsd,
        amountInRoundMatchToken: 0n,
        timestamp: conversionToUSD.timestamp,
      };

      return [
        {
          type: "InsertDonation",
          donation,
        },
      ];
    }
  }

  return [];
}
