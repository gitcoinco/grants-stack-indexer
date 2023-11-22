import { Event, EventHandlerArgs } from "chainsauce";
import { ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

import { getChainConfigById } from "../config.js";

// Event handlers
import roundMetaPtrUpdated from "./handlers/roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./handlers/applicationMetaPtrUpdated.js";
import matchAmountUpdated, {
  updateRoundMatchAmount,
} from "./handlers/matchAmountUpdated.js";
import { UnknownTokenError } from "../prices/common.js";
import type { Indexer } from "./indexer.js";
import { Address, getAddress } from "viem";
import {
  ApplicationTable,
  Application,
  ProjectTable,
  Donation,
  Round,
  NewApplication,
} from "../database/schema.js";
import { Mutation } from "../database/mutation.js";

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

const getFinalEventName = (chainId: number, originalEvent: Event): string => {
  const chain = getChainConfigById(chainId);
  const eventRenamesForChain = Object.fromEntries(
    chain.subscriptions.map((sub) => [sub.address, sub.eventsRenames])
  );

  const finalName =
    eventRenamesForChain[originalEvent.address]?.[originalEvent.name] ??
    originalEvent.name;

  return finalName;
};

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
): Promise<Mutation[]> {
  const {
    event,
    subscribeToContract,
    readContract,
    context: { db, ipfsGet, priceProvider, chainId, logger },
  } = args;

  const finalEventName = getFinalEventName(chainId, event);

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
            chainId,
            registryAddress: event.address,
            id: projectId,
            projectNumber: Number(event.params.projectID),
            metadataCid: null,
            metadata: null,
            ownerAddresses: [event.params.owner],
            createdAtBlock: event.blockNumber,
          },
        },
      ];

      break;
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

      const project = await db.query({
        type: "ProjectById",
        projectId,
      });

      if (project === null) {
        logger.error({ msg: `Project ${projectId} not found`, event });
        return [];
      }

      return [
        {
          type: "UpdateProject",
          projectId,
          project: {
            ownerAddresses: [...project.ownerAddresses, event.params.owner],
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

      const project = await db.query({
        type: "ProjectById",
        projectId,
      });

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
              (o: string) => o == event.params.owner
            ),
          },
        },
      ];
    }

    // --- ROUND
    case "RoundCreated": {
      const contract =
        finalEventName === "RoundCreatedV1"
          ? "RoundImplementationV1"
          : "RoundImplementationV2";

      const roundId = getAddress(event.params.roundAddress);

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

      const newRound = {
        chainId,
        id: roundId,
        totalDonationsCount: 0,
        totalAmountDonatedInUSD: 0,
        matchTokenAddress,
        matchAmount: 0n,
        matchAmountInUSD: 0,
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

      const insertRoundMutation: Mutation = {
        type: "InsertRound",
        round: newRound,
      };

      return [
        insertRoundMutation,
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
        roundId: event.address,
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
        totalAmountDonatedInUSD: 0,
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
          roundId: event.address,
          applicationId: projectId,
          application: {
            status: project.status,
            statusUpdatedAtBlock: event.blockNumber,
          },
        };
      });
    }

    case "ApplicationStatusesUpdated": {
      const roundId = event.address;

      const bitmap = new StatusesBitmap(256n, 2n);
      bitmap.setRow(event.params.index, event.params.status);
      const startIndex = event.params.index * bitmap.itemsPerRow;

      // XXX should be translatable to Promise.all([/* ... */].map(...)) but leaving for later as it's non-straightforward
      const mutations: Mutation[] = [];

      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        const status = bitmap.getStatus(i);
        const statusString = ApplicationStatus[
          status
        ] as ApplicationTable["status"];
        const applicationId = i.toString();

        const application = await db.query({
          type: "ApplicationById",
          chainId,
          roundId,
          applicationId,
        });

        if (application === null) {
          continue;
        }

        mutations.push({
          type: "UpdateApplication",
          chainId,
          roundId,
          applicationId: i.toString(),
          application: updateApplicationStatus(
            application,
            statusString,
            event.blockNumber
          ),
        });
      }

      return mutations;
    }

    // --- Voting Strategy
    case "VotingContractCreated": {
      if (finalEventName === "VotingContractCreatedV1") {
        subscribeToContract({
          contract: "QuadraticFundingVotingStrategyImplementationV1",
          address: event.params.votingContractAddress,
        });
      } else {
        subscribeToContract({
          contract: "QuadraticFundingVotingStrategyImplementationV2",
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
      const realDonorAddress =
        "origin" in event.params ? event.params.origin : event.params.voter;

      const roundId = getAddress(event.params.roundAddress);

      const application = await db.query({
        type: "ApplicationById",
        chainId,
        roundId,
        applicationId,
      });

      const round = await db.query({ type: "RoundById", chainId, roundId });

      if (
        application === null ||
        application.status !== "APPROVED" ||
        round === null
      ) {
        return [];
      }

      const token = event.params.token.toLowerCase();

      const conversionToUSD = await priceProvider.convertToUSD(
        chainId,
        token,
        event.params.amount,
        Number(event.blockNumber)
      );

      const amountUSD = conversionToUSD.amount;

      let amountInRoundMatchToken: bigint | null = null;
      try {
        amountInRoundMatchToken =
          round.matchTokenAddress === token
            ? event.params.amount
            : (
                await priceProvider.convertFromUSD(
                  chainId,
                  round.matchTokenAddress,
                  conversionToUSD.amount,
                  Number(event.blockNumber)
                )
              ).amount;
      } catch (err) {
        if (err instanceof UnknownTokenError) {
          logger.error({
            msg: `Skipping event ${event.name} on chain ${chainId} due to unknown token ${round.matchTokenAddress}`,
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
        roundId: event.params.roundAddress,
        donorAddress: realDonorAddress,
        recipientAddress: event.params.grantAddress,
        tokenAddress: event.params.token,
        amount: event.params.amount,
        amountInUSD: amountUSD,
        amountInRoundMatchToken,
      };

      return [
        {
          type: "UpdateApplication",
          chainId: chainId,
          roundId: round.id,
          applicationId: applicationId,
          application: {
            totalAmountDonatedInUSD:
              application.totalAmountDonatedInUSD + amountUSD,
            totalDonationsCount: application.totalDonationsCount + 1,
          },
        },
        {
          type: "UpdateRound",
          chainId: chainId,
          roundId: round.id,
          round: {
            totalAmountDonatedInUSD: round.totalAmountDonatedInUSD + amountUSD,
            totalDonationsCount: round.totalDonationsCount + 1,
          },
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
        contract: "DirectPayoutStrategyImplementationV2",
        address: event.params.payoutContractAddress,
      });
      break;
    }

    case "ApplicationInReviewUpdated": {
      const roundId = await readContract({
        contract: "DirectPayoutStrategyImplementationV2",
        address: event.address,
        functionName: "roundAddress",
      });

      const bitmap = new StatusesBitmap(256n, 1n);
      bitmap.setRow(event.params.index, event.params.status);
      const startIndex = event.params.index * bitmap.itemsPerRow;

      // XXX should be translatable to Promise.all([/* ... */].map(...)) but leaving for later as it's non-straightforward
      const mutations: Mutation[] = [];

      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        const newStatus = bitmap.getStatus(i);
        const applicationId = i.toString();

        const application = await db.query({
          type: "ApplicationById",
          chainId,
          roundId,
          applicationId,
        });

        // DirectPayoutStrategy uses status 1 for signaling IN REVIEW. In order to be considered as IN REVIEW the
        // application must be on PENDING status on the round
        if (application && application.status == "PENDING" && newStatus == 1) {
          const statusString =
            ApplicationStatus[4] as ApplicationTable["status"];

          mutations.push({
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

      return mutations;
    }
  }

  return [];
}
