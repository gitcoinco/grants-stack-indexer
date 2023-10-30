import { Event, EventHandlerArgs } from "chainsauce";
import { ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

import { getChainConfigById } from "../config.js";
import { Application, Project, Vote } from "./types.js";

// Event handlers
import roundMetaPtrUpdated from "./handlers/roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./handlers/applicationMetaPtrUpdated.js";
import matchAmountUpdated from "./handlers/matchAmountUpdated.js";
import { UnknownTokenError } from "../prices/common.js";
import type { Indexer } from "./indexer.js";
import { getAddress } from "viem";

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
  blockNumber: number
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
          id: projectId,
          projectNumber: Number(event.params.projectID),
          metaPtr: null,
          metadata: null,
          owners: [event.params.owner],
          createdAtBlock: Number(event.blockNumber),
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
        metaPtr: event.params.metaPtr.pointer,
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
        owners: [...project.owners, event.params.owner],
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
        owners: project.owners.filter((o: string) => o == event.params.owner),
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

      const applicationMetaPtr = applicationMetaPtrResolved[1];
      const metaPtr = metaPtrResolved[1];
      const token = tokenResolved.toString().toLowerCase();
      const matchAmount = matchAmountResolved;
      const applicationsStartTime = applicationsStartTimeResolved.toString();
      const applicationsEndTime = applicationsEndTimeResolved.toString();
      const roundStartTime = roundStartTimeResolved.toString();
      const roundEndTime = roundEndTimeResolved.toString();

      await db.insertRound({
        id: roundId,
        amountUSD: 0,
        votes: 0,
        token,
        matchAmount: "0",
        matchAmountUSD: 0,
        uniqueContributors: 0,
        applicationMetaPtr,
        applicationMetadata: null,
        metaPtr,
        metadata: null,
        applicationsStartTime,
        applicationsEndTime,
        roundStartTime,
        roundEndTime,
        createdAtBlock: Number(event.blockNumber),
        updatedAtBlock: Number(event.blockNumber),
      });

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
              newMetaPtr: { protocol: 0n, pointer: metaPtr },
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
              newMetaPtr: { protocol: 0n, pointer: applicationMetaPtr },
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

      const application: Application = {
        id: applicationIndex,
        projectId: projectId,
        roundId: event.address,
        status: "PENDING",
        amountUSD: 0,
        votes: 0,
        uniqueContributors: 0,
        metadata: metadata ?? null,
        createdAtBlock: Number(event.blockNumber),
        statusUpdatedAtBlock: Number(event.blockNumber),
        statusSnapshots: [
          {
            status: "PENDING",
            statusUpdatedAtBlock: Number(event.blockNumber),
          },
        ],
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
            roundId: event.address,
            applicationId: projectId,
          },
          {
            status: projectApp.status,
            statusUpdatedAtBlock: Number(event.blockNumber),
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
          updateApplicationStatus(
            application,
            statusString,
            Number(event.blockNumber)
          )
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
      const voteId = ethers.utils.solidityKeccak256(
        ["string"],
        [`${event.blockNumber}-${event.logIndex}`]
      );

      const applicationId =
        "applicationIndex" in event.params
          ? event.params.applicationIndex.toString()
          : event.params.projectId.toString();

      // If an `origin` field is present, this event comes from MRC, thus ignore the
      // `voter` field because that's the contract. See AIP-13
      const realVoterAddress =
        "origin" in event.params ? event.params.origin : event.params.voter;

      const roundId = getAddress(event.params.roundAddress);

      const application = await db.getApplicationById({
        roundId,
        applicationId,
      });

      const round = await db.getRoundById(roundId);

      if (
        application === null ||
        application.status !== "APPROVED" ||
        round === null
      ) {
        return;
      }

      const token = event.params.token.toLowerCase();

      const conversionToUSD = await priceProvider.convertToUSD(
        chainId,
        token,
        event.params.amount,
        Number(event.blockNumber)
      );

      const amountUSD = conversionToUSD.amount;

      let amountRoundToken: string | null = null;
      try {
        amountRoundToken =
          round.token === token
            ? event.params.amount.toString()
            : (
                await priceProvider.convertFromUSD(
                  chainId,
                  round.token,
                  conversionToUSD.amount,
                  Number(event.blockNumber)
                )
              ).amount.toString();
      } catch (err) {
        if (err instanceof UnknownTokenError) {
          logger.error({
            msg: `Skipping event ${event.name} on chain ${chainId} due to unknown token ${round.token}`,
            err,
            event,
          });
          return;
        } else {
          throw err;
        }
      }

      const vote: Vote = {
        id: voteId,
        transaction: event.transactionHash,
        blockNumber: Number(event.blockNumber),
        projectId: event.params.projectId,
        applicationId: applicationId,
        roundId: event.params.roundAddress,
        voter: realVoterAddress,
        grantAddress: event.params.grantAddress,
        token: event.params.token,
        amount: event.params.amount.toString(),
        amountUSD: amountUSD,
        amountRoundToken,
      };

      await Promise.all([
        db.getContributorById(realVoterAddress).then((contributor) => {
          if (contributor === null) {
            return db.insertContributor({
              id: realVoterAddress,
              amountUSD: amountUSD,
              votes: 1,
            });
          }

          return db.updateContributorById(realVoterAddress, {
            amountUSD: contributor.amountUSD + amountUSD,
            votes: contributor.votes + 1,
          });
        }),
        db.updateApplicationById(
          {
            roundId: round.id,
            applicationId: applicationId,
          },
          {
            amountUSD: application.amountUSD + amountUSD,
            votes: application.votes + 1,
          }
        ),
        db.updateRoundById(event.address, {
          amountUSD: round.amountUSD + amountUSD,
          votes: round.votes + 1,
        }),

        db.insertVote(vote),
      ]);

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
              Number(event.blockNumber)
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
