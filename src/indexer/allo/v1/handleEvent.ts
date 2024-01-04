import { EventHandlerArgs } from "chainsauce";
import { ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

// Event handlers
import { UnknownTokenError } from "../../../prices/common.js";
import type { Indexer } from "../../indexer.js";
import {
  ApplicationTable,
  Application,
  ProjectTable,
  Donation,
  Round,
  NewApplication,
  NewRound,
} from "../../../database/schema.js";
import { Changeset } from "../../../database/index.js";
import { Address, parseAddress } from "../../../address.js";
import matchAmountUpdated, {
  updateRoundMatchAmount,
} from "./matchAmountUpdated.js";
import roundMetaPtrUpdated from "./roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./applicationMetaPtrUpdated.js";

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

function updateApplicationStatus(
  application: Application,
  newStatus: Application["status"],
  blockNumber: bigint
): Pick<Application, "status" | "statusUpdatedAtBlock" | "statusSnapshots"> {
  const statusSnapshots = [...application.statusSnapshots];

  if (application.status !== newStatus) {
    statusSnapshots.push({
      status: newStatus,
      statusUpdatedAtBlock: blockNumber,
    });
  }

  return {
    status: newStatus,
    statusUpdatedAtBlock: blockNumber,
    statusSnapshots: statusSnapshots,
  };
}

export async function handleEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    subscribeToContract,
    readContract,
    context: { db, ipfsGet, priceProvider, logger },
  } = args;

  switch (event.name) {
    // -- PROJECTS
    case "ProjectCreated": {
      const projectId = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      return [
        {
          type: "InsertProject",
          project: {
            tags: ["allo-v1"],
            chainId,
            registryAddress: parseAddress(event.address),
            id: projectId,
            projectNumber: Number(event.params.projectID),
            metadataCid: null,
            metadata: null,
            ownerAddresses: [parseAddress(event.params.owner)],
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

      return [
        {
          type: "UpdateProject",
          projectId,
          project: { metadata, metadataCid },
        },
      ];
    }

    case "OwnerAdded": {
      const projectId = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const project = await db.getProjectById(projectId);

      if (project === null) {
        logger.error({ msg: `Project ${projectId} not found`, event });
        return [];
      }

      return [
        {
          type: "UpdateProject",
          projectId,
          project: {
            ownerAddresses: [
              ...project.ownerAddresses,
              parseAddress(event.params.owner),
            ],
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

      const project = await db.getProjectById(projectId);

      if (project === null) {
        logger.error({ msg: `Project ${projectId} not found`, event });
        return [];
      }

      return [
        {
          type: "UpdateProject",
          projectId,
          project: {
            ownerAddresses: project.ownerAddresses.filter(
              (owner) => owner !== parseAddress(event.params.owner)
            ),
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

      const newRound: NewRound = {
        chainId,
        id: roundId,
        tags: ["allo-v1"],
        totalDonationsCount: 0,
        totalAmountDonatedInUsd: 0,
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

    case "MatchAmountUpdated": {
      return await matchAmountUpdated({ ...args, event });
    }

    case "RoundMetaPtrUpdated": {
      return await roundMetaPtrUpdated({ ...args, event });
    }

    case "ApplicationMetaPtrUpdated": {
      return await applicationMetaPtrUpdated({ ...args, event });
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

      const application: NewApplication = {
        chainId,
        id: applicationIndex,
        projectId: projectId,
        roundId: parseAddress(event.address),
        status: "PENDING",
        metadataCid: event.params.applicationMetaPtr.pointer,
        metadata: metadata ?? null,
        createdAtBlock: event.blockNumber,
        statusUpdatedAtBlock: event.blockNumber,
        statusSnapshots: [
          {
            status: "PENDING",
            statusUpdatedAtBlock: event.blockNumber,
          },
        ],
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
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
                application: updateApplicationStatus(
                  application,
                  statusString,
                  event.blockNumber
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

      const conversionToUSD = await priceProvider.convertToUSD(
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
                await priceProvider.convertFromUSD(
                  chainId,
                  roundMatchTokenAddress,
                  conversionToUSD.amount,
                  event.blockNumber
                )
              ).amount;
      } catch (err) {
        if (err instanceof UnknownTokenError) {
          logger.error({
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
      };

      return [
        {
          type: "IncrementApplicationDonationStats",
          chainId,
          roundId,
          applicationId,
          amountInUsd,
        },
        {
          type: "IncrementRoundDonationStats",
          chainId,
          roundId,
          amountInUsd,
        },
        {
          type: "InsertDonation",
          donation,
        },
      ];
    }

    // --- Direct Payout Strategy
    case "PayoutContractCreated": {
      subscribeToContract({
        contract: "AlloV1/DirectPayoutStrategyImplementation/V2",
        address: event.params.payoutContractAddress,
      });
      break;
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
            application: updateApplicationStatus(
              application,
              statusString,
              event.blockNumber
            ),
          });
        }
      }

      return changesets;
    }
  }

  return [];
}
