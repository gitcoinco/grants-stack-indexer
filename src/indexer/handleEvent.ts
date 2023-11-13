import { Event, EventHandlerArgs } from "chainsauce";
import { ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

import { getChainConfigById } from "../config.js";

// Event handlers
import roundMetaPtrUpdated from "./handlers/roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./handlers/applicationMetaPtrUpdated.js";
import matchAmountUpdated from "./handlers/matchAmountUpdated.js";
import { UnknownTokenError } from "../prices/common.js";
import type { Indexer } from "./indexer.js";
import { Address, getAddress } from "viem";
import {
  NewApplication,
  Application,
  Project,
  Donation,
} from "../database/postgres.js";

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
      statusUpdatedAtBlock: Number(blockNumber),
    });
  }

  return {
    status: newStatus,
    statusUpdatedAtBlock: blockNumber,
    statusSnapshots: statusSnapshots,
  };
}

export async function handleEvent(args: EventHandlerArgs<Indexer>) {
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

      try {
        await db.insertProject({
          chainId,
          registryAddress: event.address,
          id: projectId,
          projectNumber: Number(event.params.projectID),
          metadataCid: null,
          metadata: null,
          ownerAddresses: [event.params.owner],
          createdAtBlock: event.blockNumber,
        });
      } catch (e) {
        console.log(e);
        if (
          projectId ===
          "0x9e286e7acf36c59ff7e3c7eb2ea1ad2fcfefa7d181a3cbe05bd9e4df55b99680"
        ) {
          console.log(event);
          process.exit(1);
        }
      }

      break;
    }

    case "MetadataUpdated": {
      const id = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const metadata = await ipfsGet<Project["metadata"]>(
        event.params.metaPtr.pointer
      );

      await db.updateProjectById(id, {
        metadataCid: event.params.metaPtr.pointer,
        metadata: metadata ?? null,
      });

      break;
    }

    case "OwnerAdded": {
      const id = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const project = await db.getProjectById(id);

      if (project === null) {
        logger.error({ msg: `Project ${id} not found`, event });
        return;
      }

      await db.updateProjectById(id, {
        ownerAddresses: [...project.ownerAddresses, event.params.owner],
      });

      break;
    }

    case "OwnerRemoved": {
      const id = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      const project = await db.getProjectById(id);

      if (project === null) {
        logger.error({ msg: `Project ${id} not found`, event });
        return;
      }

      await db.updateProjectById(id, {
        ownerAddresses: project.ownerAddresses.filter(
          (o: string) => o == event.params.owner
        ),
      });

      break;
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

      await db
        .insertRound({
          chainId,
          id: roundId,
          totalUniqueDonors: 0,
          totalDonationsCount: 0,
          totalAmountDonatedInUSD: 0,
          matchTokenAddress,
          matchAmount: 0n,
          matchAmountInUSD: 0,
          applicationMetadataCid,
          applicationMetadata: null,
          roundMetadataCid,
          roundMetadata: null,
          applicationsStartTime,
          applicationsEndTime,
          donationsStartTime,
          donationsEndTime,
          createdAtBlock: event.blockNumber,
          updatedAtBlock: event.blockNumber,
        })
        .catch((e) => console.log(e));

      await Promise.all([
        matchAmountUpdated({
          ...args,
          event: {
            ...event,
            name: "MatchAmountUpdated",
            address: event.params.roundAddress,
            params: {
              newAmount: matchAmount,
            },
          },
        }),
        roundMetaPtrUpdated({
          ...args,
          event: {
            ...event,
            name: "RoundMetaPtrUpdated",
            address: event.params.roundAddress,
            params: {
              newMetaPtr: { protocol: 0n, pointer: roundMetadataCid },
              oldMetaPtr: { protocol: 0n, pointer: "" },
            },
          },
        }),
        applicationMetaPtrUpdated({
          ...args,
          event: {
            ...event,
            name: "ApplicationMetaPtrUpdated",
            address: event.params.roundAddress,
            params: {
              newMetaPtr: { protocol: 0n, pointer: applicationMetadataCid },
              oldMetaPtr: { protocol: 0n, pointer: "" },
            },
          },
        }),
      ]);

      break;
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

      const metadata = await ipfsGet<Application["metadata"]>(
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
            statusUpdatedAtBlock: Number(event.blockNumber),
          },
        ],

        totalAmountDonatedInUSD: 0,
        totalDonationsCount: 0,
        totalUniqueDonors: 0,
      };

      await db.insertApplication(application);

      break;
    }

    case "ProjectsMetaPtrUpdated": {
      const projects = await ipfsGet<
        { id: string; status: Application["status"]; payoutAddress: string }[]
      >(event.params.newMetaPtr.pointer);

      if (!projects) {
        return;
      }

      for (const projectApp of projects) {
        const projectId = projectApp.id.split("-")[0];

        await db.updateApplicationById(
          {
            chainId,
            roundId: event.address,
            applicationId: projectId,
          },
          {
            status: projectApp.status,
            statusUpdatedAtBlock: event.blockNumber,
          }
        );
      }
      break;
    }

    case "ApplicationStatusesUpdated": {
      const bitmap = new StatusesBitmap(256n, 2n);
      bitmap.setRow(event.params.index, event.params.status);
      const startIndex = event.params.index * bitmap.itemsPerRow;

      // XXX should be translatable to Promise.all([/* ... */].map(...)) but leaving for later as it's non-straightforward
      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        const status = bitmap.getStatus(i);
        const applicationId = {
          chainId,
          roundId: event.address,
          applicationId: i.toString(),
        };
        const statusString = ApplicationStatus[status] as Application["status"];
        const application = await db.getApplicationById(applicationId);

        if (application === null) {
          continue;
        }

        await db.updateApplicationById(
          applicationId,
          updateApplicationStatus(application, statusString, event.blockNumber)
        );
      }
      break;
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

      console.time("donation");
      const application = await db.getApplicationById({
        chainId,
        roundId,
        applicationId,
      });

      const round = await db.getRoundById({ chainId, roundId });

      if (
        application === null ||
        application.status !== "APPROVED" ||
        round === null
      ) {
        return;
      }

      const token = event.params.token.toLowerCase();

      console.time("token");
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
          return;
        } else {
          throw err;
        }
      }
      console.timeEnd("token");

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

      await Promise.all([
        // db.updateApplicationById(
        //   {
        //     roundId: round.id,
        //     applicationId: applicationId,
        //   },
        //   {
        //     totalAmountDonatedInUSD:
        //       application.totalAmountDonatedInUSD + amountUSD,
        //     totalDonationsCount: application.totalDonationsCount + 1,
        //   }
        // ),
        // db.updateRoundById(event.address, {
        //   totalAmountDonatedInUSD: round.totalAmountDonatedInUSD + amountUSD,
        //   totalDonationsCount: round.totalDonationsCount + 1,
        // }),
        db.insertDonation(donation),
      ]);
      console.timeEnd("donation");

      break;
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
      const round = await readContract({
        contract: "DirectPayoutStrategyImplementationV2",
        address: event.address,
        functionName: "roundAddress",
      });

      const bitmap = new StatusesBitmap(256n, 1n);
      bitmap.setRow(event.params.index, event.params.status);
      const startIndex = event.params.index * bitmap.itemsPerRow;

      // XXX should be translatable to Promise.all([/* ... */].map(...)) but leaving for later as it's non-straightforward
      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        const newStatus = bitmap.getStatus(i);
        const applicationId = {
          chainId,
          roundId: round,
          applicationId: i.toString(),
        };
        const application = await db.getApplicationById(applicationId);

        // DirectPayoutStrategy uses status 1 for signaling IN REVIEW. In order to be considered as IN REVIEW the
        // application must be on PENDING status on the round
        if (application && application.status == "PENDING" && newStatus == 1) {
          const statusString = ApplicationStatus[4] as Application["status"];
          await db.updateApplicationById(
            applicationId,
            updateApplicationStatus(
              application,
              statusString,
              event.blockNumber
            )
          );
        }
      }

      break;
    }

    default:
    // console.log("TODO", event.name, event.params);
  }
}
