import { EventHandlerArgs } from "chainsauce";
import { ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

// Event handlers
import { UnknownTokenError } from "../../../prices/common.js";
import type { Indexer } from "../../indexer.js";
import {
  ApplicationTable,
  ProjectTable,
  Donation,
  Round,
  NewApplication,
  NewRound,
  Project,
  MatchingDistributionSchema,
} from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { Address, parseAddress } from "../../../address.js";
import matchAmountUpdated, {
  updateRoundMatchAmount,
} from "./matchAmountUpdated.js";
import roundMetaPtrUpdated from "./roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./applicationMetaPtrUpdated.js";
import roleGranted from "./roleGranted.js";
import roleRevoked from "./roleRevoked.js";
import { convertFromUSD, convertToUSD } from "../../../prices/provider.js";
import {
  updateApplicationsStartTime,
  updateApplicationsEndTime,
  updateDonationsStartTime,
  updateDonationsEndTime,
} from "./timeUpdated.js";
import { ProjectMetadataSchema } from "../../projectMetadata.js";
import { updateApplicationStatus } from "../application.js";

enum ApplicationStatus {
  PENDING = 0,
  APPROVED,
  REJECTED,
  CANCELLED,
  IN_REVIEW,
}

function fullProjectId(
  projectChainId: number,
  projectId: number,
  projectRegistryAddress: string
) {
  return ethers.utils.solidityKeccak256(
    ["uint256", "address", "uint256"],
    [projectChainId, projectRegistryAddress, projectId]
  );
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
    context: { db, rpcClient, ipfsGet, priceProvider, logger },
  } = args;

  switch (event.name) {
    // -- PROJECTS
    case "ProjectCreated": {
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

    case "MetadataUpdated": {
      const projectId = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const metadataCid = event.params.metaPtr.pointer;
      const metadata = await ipfsGet<ProjectTable["metadata"]>(metadataCid);
      const parsedMetadata = ProjectMetadataSchema.safeParse(metadata);

      if (parsedMetadata.success === false) {
        logger.warn({
          msg: `MetadataUpdated: Failed to parse metadata for project ${projectId}`,
          event,
          metadataCid,
          metadata,
        });
        return [];
      }

      let projectName = "";

      if ("name" in parsedMetadata.data) {
        projectName = parsedMetadata.data.name;
      } else if ("title" in parsedMetadata.data) {
        projectName = parsedMetadata.data.title;
      }

      return [
        {
          type: "UpdateProject",
          chainId,
          projectId,
          project: {
            name: projectName,
            metadata: parsedMetadata.data,
            metadataCid,
          },
        },
      ];
    }

    case "OwnerAdded": {
      const projectId = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const project = await db.getProjectById(chainId, projectId);

      if (project === null) {
        logger.warn({
          msg: `Project ${chainId}/${projectId} not found`,
          event,
        });
        return [];
      }

      return [
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

    case "OwnerRemoved": {
      const projectId = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const project = await db.getProjectById(chainId, projectId);

      if (project === null) {
        logger.warn({
          msg: `Project ${chainId}/${projectId} not found`,
          event,
        });
        return [];
      }

      return [
        {
          type: "DeleteAllProjectRolesByRoleAndAddress",
          projectRole: {
            chainId,
            projectId,
            role: "owner",
            address: parseAddress(event.params.owner),
          },
        },
      ];
    }

    // --- Program
    case "ProgramCreated": {
      const programAddress = parseAddress(event.params.programContractAddress);
      const contract = "AlloV1/ProgramImplementation/V1";

      subscribeToContract({
        contract,
        address: programAddress,
      });

      const [metaPtrResolved] = await Promise.all([
        readContract({
          contract,
          address: event.params.programContractAddress,
          functionName: "metaPtr",
        }),
      ]);

      const metadataCid = metaPtrResolved[1];

      const metadata = await ipfsGet<Project["metadata"]>(metadataCid);

      const parsedMetadata = ProjectMetadataSchema.safeParse(metadata);

      if (
        parsedMetadata.success === false ||
        parsedMetadata.data.type !== "program"
      ) {
        logger.warn({
          msg: `ProgramCreated: Failed to parse metadata for program ${programAddress}`,
          event,
          metadataCid,
          metadata,
        });
        return [];
      }

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;

      return [
        {
          type: "InsertProject",
          project: {
            tags: ["allo-v1", "program"],
            chainId,
            registryAddress: parseAddress(
              "0x0000000000000000000000000000000000000000"
            ),
            id: programAddress,
            name: parsedMetadata.data.name,
            projectNumber: null,
            metadataCid: metadataCid,
            metadata: parsedMetadata.data,
            createdByAddress: parseAddress(createdBy),
            createdAtBlock: event.blockNumber,
            updatedAtBlock: event.blockNumber,
            projectType: "canonical",
          },
        },
      ];
    }

    // --- ROUND
    case "RoundCreated": {
      const contract =
        event.contractName === "AlloV1/RoundFactory/V1"
          ? "AlloV1/RoundImplementation/V1"
          : "AlloV1/RoundImplementation/V2";

      const roundId = parseAddress(event.params.roundAddress);

      subscribeToContract({
        contract,
        address: roundId,
      });

      // programAddress
      const projectId = parseAddress(event.params.ownedBy);

      const [
        matchAmountResolved,
        applicationMetaPtrResolved,
        metaPtrResolved,
        tokenResolved,
        applicationsStartTimeResolved,
        applicationsEndTimeResolved,
        roundStartTimeResolved,
        roundEndTimeResolved,
      ] = await Promise.all([
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "matchAmount",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "applicationMetaPtr",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "roundMetaPtr",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "token",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "applicationsStartTime",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "applicationsEndTime",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "roundStartTime",
        }),
        readContract({
          contract,
          address: event.params.roundAddress,
          functionName: "roundEndTime",
        }),
      ]);

      const applicationMetadataCid = applicationMetaPtrResolved[1];
      const roundMetadataCid = metaPtrResolved[1];
      const matchTokenAddress = tokenResolved
        .toString()
        .toLowerCase() as Address;
      const matchAmount = matchAmountResolved;
      const applicationsStartTime = new Date(
        Number(applicationsStartTimeResolved) * 1000
      );
      const applicationsEndTime = new Date(
        Number(applicationsEndTimeResolved) * 1000
      );
      const donationsStartTime = new Date(
        Number(roundStartTimeResolved) * 1000
      );
      const donationsEndTime = new Date(Number(roundEndTimeResolved) * 1000);

      const roundMetadata =
        await ipfsGet<Round["roundMetadata"]>(roundMetadataCid);

      const applicationMetadata = await ipfsGet<Round["applicationMetadata"]>(
        applicationMetadataCid
      );

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;

      const newRound: NewRound = {
        chainId,
        id: roundId,
        tags: ["allo-v1"],
        totalDonationsCount: 0,
        totalAmountDonatedInUsd: 0,
        fundedAmount: 0n,
        fundedAmountInUsd: 0,
        uniqueDonorsCount: 0,
        matchTokenAddress,
        matchAmount: 0n,
        matchAmountInUsd: 0,
        applicationMetadataCid,
        applicationMetadata: applicationMetadata,
        roundMetadataCid,
        roundMetadata: roundMetadata,
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
        strategyAddress: parseAddress(
          "0x0000000000000000000000000000000000000000"
        ),
        strategyId: "",
        strategyName: "",
        projectId,
        createdByAddress: parseAddress(createdBy),
        createdAtBlock: event.blockNumber,
        updatedAtBlock: event.blockNumber,
      };

      const insertRoundChangeset: Changeset = {
        type: "InsertRound",
        round: newRound,
      };

      return [
        insertRoundChangeset,
        await updateRoundMatchAmount({
          round: newRound,
          newMatchAmount: matchAmount,
          blockNumber: event.blockNumber,
          priceProvider: priceProvider,
        }),
      ];
    }

    case "RoleGranted": {
      return await roleGranted({ ...args, event });
    }

    case "RoleRevoked": {
      return await roleRevoked({ ...args, event });
    }

    case "MatchAmountUpdated": {
      return await matchAmountUpdated({ ...args, event });
    }

    case "RoundMetaPtrUpdated": {
      return await roundMetaPtrUpdated({ ...args, event });
    }

    case "ApplicationMetaPtrUpdated": {
      return await applicationMetaPtrUpdated({ ...args, event });
    }

    case "ApplicationsStartTimeUpdated": {
      return await updateApplicationsStartTime({ ...args, event });
    }

    case "ApplicationsEndTimeUpdated": {
      return await updateApplicationsEndTime({ ...args, event });
    }

    case "RoundStartTimeUpdated": {
      return await updateDonationsStartTime({ ...args, event });
    }

    case "RoundEndTimeUpdated": {
      return await updateDonationsEndTime({ ...args, event });
    }

    case "NewProjectApplication": {
      const projectId =
        "project" in event.params
          ? event.params.project.toString()
          : event.params.projectID.toString();

      const applicationIndex =
        "applicationIndex" in event.params
          ? event.params.applicationIndex.toString()
          : projectId;

      const metadata = await ipfsGet<ApplicationTable["metadata"]>(
        event.params.applicationMetaPtr.pointer
      );

      const tx = await rpcClient.getTransaction({
        hash: event.transactionHash,
      });

      const createdBy = tx.from;
      const { timestamp } = await getBlock();

      const application: NewApplication = {
        chainId,
        id: applicationIndex,
        projectId: projectId,
        anchorAddress: null,
        roundId: parseAddress(event.address),
        status: "PENDING",
        metadataCid: event.params.applicationMetaPtr.pointer,
        metadata: metadata ?? null,
        createdByAddress: parseAddress(createdBy),
        createdAtBlock: event.blockNumber,
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
        tags: ["allo-v1"],
      };

      return [
        {
          type: "InsertApplication",
          application,
        },
      ];
    }

    case "ProjectsMetaPtrUpdated": {
      const roundId = parseAddress(event.address);

      const projects = await ipfsGet<
        {
          id: string;
          status: ApplicationTable["status"];
          payoutAddress: string;
        }[]
      >(event.params.newMetaPtr.pointer);

      if (projects === undefined) {
        return [];
      }

      return projects.map((project) => {
        const projectId = project.id.split("-")[0];

        return {
          type: "UpdateApplication",
          chainId,
          roundId,
          applicationId: projectId,
          application: {
            status: project.status,
            statusUpdatedAtBlock: event.blockNumber,
          },
        };
      });
    }

    case "ApplicationStatusesUpdated": {
      const roundId = parseAddress(event.address);

      const bitmap = new StatusesBitmap(256n, 2n);
      bitmap.setRow(event.params.index, event.params.status);
      const startIndex = event.params.index * bitmap.itemsPerRow;

      const indexes = [];

      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        indexes.push(i);
      }

      // TODO: batch update
      return (
        await Promise.all(
          indexes.map(async (i) => {
            const status = bitmap.getStatus(i);
            const statusString = ApplicationStatus[
              status
            ] as ApplicationTable["status"];
            const applicationId = i.toString();

            const application = await db.getApplicationById(
              chainId,
              roundId,
              applicationId
            );

            if (application === null) {
              return [];
            }

            return [
              {
                type: "UpdateApplication",
                chainId,
                roundId,
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

    // --- Voting Strategy
    case "VotingContractCreated": {
      if (
        event.contractName === "AlloV1/QuadraticFundingVotingStrategyFactory/V1"
      ) {
        subscribeToContract({
          contract: "AlloV1/QuadraticFundingVotingStrategyImplementation/V1",
          address: event.params.votingContractAddress,
        });
      } else {
        subscribeToContract({
          contract: "AlloV1/QuadraticFundingVotingStrategyImplementation/V2",
          address: event.params.votingContractAddress,
        });
      }
      break;
    }

    // --- Votes
    case "Voted": {
      const donationId = ethers.utils.solidityKeccak256(
        ["string"],
        [`${event.blockNumber}-${event.logIndex}`]
      );

      const applicationId =
        "applicationIndex" in event.params
          ? event.params.applicationIndex.toString()
          : event.params.projectId.toString();

      // If an `origin` field is present, this event comes from MRC, thus ignore the
      // `voter` field because that's the contract. See AIP-13
      const realDonorAddress = parseAddress(
        "origin" in event.params ? event.params.origin : event.params.voter
      );

      const roundId = parseAddress(event.params.roundAddress);

      const roundMatchTokenAddress = await db.getRoundMatchTokenAddressById(
        chainId,
        roundId
      );

      if (roundMatchTokenAddress === null) {
        return [];
      }

      const token = parseAddress(event.params.token);

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
                  conversionToUSD.amount,
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

      const donation: Donation = {
        id: donationId,
        chainId,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        projectId: event.params.projectId,
        applicationId: applicationId,
        roundId: parseAddress(event.params.roundAddress),
        donorAddress: realDonorAddress,
        recipientAddress: parseAddress(event.params.grantAddress),
        tokenAddress: parseAddress(event.params.token),
        amount: event.params.amount,
        amountInUsd: amountInUsd,
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

    // --- Payout Strategy
    case "PayoutContractCreated": {
      let contractImplementationName: typeof event.contractName;
      let strategyName: string;

      if (event.contractName === "AlloV1/DirectPayoutStrategyFactory/V2") {
        contractImplementationName =
          "AlloV1/DirectPayoutStrategyImplementation/V2";
        strategyName = "allov1.Direct";
      } else if (
        event.contractName === "AlloV1/MerklePayoutStrategyFactory/V2"
      ) {
        contractImplementationName =
          "AlloV1/MerklePayoutStrategyImplementation/V2";
        strategyName = "allov1.QF";
      } else {
        throw new Error(`Unknown payout contract: ${event.contractName}`);
      }

      subscribeToContract({
        contract: contractImplementationName,
        address: event.params.payoutContractAddress,
      });

      const roundId = parseAddress(
        await readContract({
          contract: contractImplementationName,
          functionName: "roundAddress",
          address: event.params.payoutContractAddress,
        })
      );

      return [
        {
          type: "UpdateRound",
          roundId: roundId,
          chainId: chainId,
          round: {
            strategyAddress: parseAddress(event.params.payoutContractAddress),
            strategyName,
          },
        },
      ];
    }

    case "ReadyForPayout": {
      return [
        {
          type: "UpdateRoundByStrategyAddress",
          chainId: chainId,
          strategyAddress: parseAddress(event.address),
          round: {
            readyForPayoutTransaction: event.transactionHash,
          },
        },
      ];
    }

    case "DistributionUpdated": {
      // FIXME: chinsauce should narrow the type based on the contract name
      if (!("distributionMetaPtr" in event.params)) {
        return [];
      }

      const strategyAddress = parseAddress(event.address);
      const rawDistribution = await ipfsGet(
        event.params.distributionMetaPtr.pointer
      );
      const distribution =
        MatchingDistributionSchema.safeParse(rawDistribution);

      if (!distribution.success) {
        logger.warn({
          msg: "Failed to parse distribution",
          error: distribution.error,
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
            matchingDistribution: distribution.data,
          },
        },
      ];
    }

    case "ApplicationInReviewUpdated": {
      const roundId = parseAddress(
        await readContract({
          contract: "AlloV1/DirectPayoutStrategyImplementation/V2",
          address: event.address,
          functionName: "roundAddress",
        })
      );

      const bitmap = new StatusesBitmap(256n, 1n);
      bitmap.setRow(event.params.index, event.params.status);
      const startIndex = event.params.index * bitmap.itemsPerRow;

      // XXX should be translatable to Promise.all([/* ... */].map(...)) but leaving for later as it's non-straightforward
      const changesets: Changeset[] = [];

      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        const newStatus = bitmap.getStatus(i);
        const applicationId = i.toString();

        const application = await db.getApplicationById(
          chainId,
          roundId,
          applicationId
        );

        // DirectPayoutStrategy uses status 1 for signaling IN REVIEW. In order to be considered as IN REVIEW the
        // application must be on PENDING status on the round
        if (application && application.status == "PENDING" && newStatus == 1) {
          const statusString =
            ApplicationStatus[4] as ApplicationTable["status"];

          changesets.push({
            type: "UpdateApplication",
            chainId,
            roundId,
            applicationId,
            application: await updateApplicationStatus(
              application,
              statusString,
              event.blockNumber,
              getBlock
            ),
          });
        }
      }

      return changesets;
    }

    case "PayoutMade": {
      const payoutStrategyAddress = parseAddress(event.address);
      const roundId = parseAddress(
        await readContract({
          contract: "AlloV1/DirectPayoutStrategyImplementation/V2",
          functionName: "roundAddress",
          address: payoutStrategyAddress,
        })
      );
      const applicationId = event.params.applicationIndex;
      const amount = event.params.amount;
      const roundMatchTokenAddress = await db.getRoundMatchTokenAddressById(
        chainId,
        roundId
      );

      if (!roundMatchTokenAddress) {
        logger.warn({
          msg: "No round match token address found",
          chainId,
          roundId,
          event,
        });
        return [];
      }

      const amountInUsd = (
        await convertToUSD(
          priceProvider,
          chainId,
          parseAddress(event.params.token),
          amount,
          event.blockNumber
        )
      ).amount;

      const amountInRoundMatchToken = (
        await convertFromUSD(
          priceProvider,
          chainId,
          roundMatchTokenAddress,
          amountInUsd,
          event.blockNumber
        )
      ).amount;

      return [
        {
          type: "InsertApplicationPayout",
          payout: {
            amount: event.params.amount,
            applicationId: applicationId.toString(),
            roundId,
            chainId,
            tokenAddress: parseAddress(event.params.token),
            amountInRoundMatchToken,
            amountInUsd,
            transactionHash: event.transactionHash,
          },
        },
      ];
    }

    case "FundsDistributed": {
      const payoutContractName = "AlloV1/MerklePayoutStrategyImplementation/V2";
      if (event.contractName === payoutContractName) {
        // since we are in the Allo V1 handler we know that AlloV1/MerklePayoutStrategyImplementation/V2
        // has a projectId field instead of a recipientId field like in Allo V2
        if ("projectId" in event.params) {
          const payoutStrategyAddress = parseAddress(event.address);
          const roundId = parseAddress(
            await readContract({
              contract: payoutContractName,
              functionName: "roundAddress",
              address: payoutStrategyAddress,
            })
          );
          const projectId = event.params.projectId;
          const application = await db.getApplicationByProjectId(
            chainId,
            roundId,
            projectId
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
          ];
        }
      }
    }
  }

  return [];
}
