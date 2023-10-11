import { Logger } from "pino";
import {
  Database,
  Event as ChainsauceEvent,
  Indexer,
  EventHandlerArgs,
} from "chainsauce";
import { ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

import { getChainConfigById } from "../config.js";
import {
  Application,
  Contributor,
  DetailedVote,
  Project,
  Round,
  Vote,
} from "./types.js";
import { Event } from "./events.js";
import { PriceProvider } from "../prices/provider.js";
import abis from "./abis/index.js";

// Event handlers
import roundMetaPtrUpdated from "./handlers/roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./handlers/applicationMetaPtrUpdated.js";
import matchAmountUpdated from "./handlers/matchAmountUpdated.js";
import { UnknownTokenError } from "../prices/common.js";

export interface EventHandlerContext {
  chainId: number;
  db: Database;
  ipfsGet: <T>(cid: string) => Promise<T | undefined>;
  priceProvider: PriceProvider;
  logger: Logger;
}

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

const getFinalEventName = (
  chainId: number,
  originalEvent: ChainsauceEvent
): string => {
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
): Application {
  const newApplication: Application = { ...application };
  const prevStatus = application.status;
  newApplication.status = newStatus;
  newApplication.statusUpdatedAtBlock = blockNumber;
  newApplication.statusSnapshots = [...application.statusSnapshots];

  if (prevStatus !== newStatus) {
    newApplication.statusSnapshots.push({
      status: newStatus,
      statusUpdatedAtBlock: blockNumber,
    });
  }

  return newApplication;
}

export async function handleEvent({
  event: originalEvent,
  subscribeToContract,
  readContract,
  context: { db, ipfsGet, priceProvider, chainId, logger },
}: EventHandlerArgs<Indexer<typeof abis, EventHandlerContext>>) {
  const eventName = getFinalEventName(chainId, originalEvent);

  const event = {
    ...originalEvent,
    name: eventName,
  } as Event;

  switch (event.name) {
    // -- PROJECTS
    case "ProjectCreated": {
      await db.collection<Project>("projects").insert({
        id: fullProjectId(
          chainId,
          Number(event.params.projectID),
          event.address
        ),
        projectNumber: Number(event.params.projectID),
        metaPtr: null,
        metadata: null,
        owners: [event.params.owner],
        createdAtBlock: Number(event.blockNumber),
      });

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

      await db.collection<Project>("projects").updateById(id, (project) => {
        return {
          ...project,
          metaPtr: event.params.metaPtr.pointer,
          metadata: metadata ?? null,
        };
      });

      break;
    }

    case "OwnerAdded": {
      const id = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      await db.collection<Project>("projects").updateById(id, (project) => ({
        ...project,
        owners: [...project.owners, event.params.owner],
      }));
      break;
    }

    case "OwnerRemoved": {
      const id = fullProjectId(
        chainId,
        Number(event.params.projectID),
        event.address
      );

      await db.collection<Project>("projects").updateById(id, (project) => ({
        ...project,
        owners: project.owners.filter((o: string) => o == event.params.owner),
      }));
      break;
    }

    // --- ROUND
    case "RoundCreatedV1":
    case "RoundCreated": {
      const contract =
        event.name === "RoundCreatedV1"
          ? "RoundImplementationV1"
          : "RoundImplementationV2";

      subscribeToContract({
        contract,
        address: event.params.roundAddress,
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

      const roundId = event.params.roundAddress;

      await Promise.all([
        db.collection<Round>("rounds").insert({
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
        }),
        // create empty sub collections
        db.collection(`rounds/${roundId}/projects`),
        db.collection(`rounds/${roundId}/applications`),
        db.collection(`rounds/${roundId}/votes`),
        db.collection(`rounds/${roundId}/contributors`),
      ]);

      await Promise.all([
        matchAmountUpdated(
          {
            ...event,
            name: "MatchAmountUpdated",
            address: event.params.roundAddress,
            params: {
              newAmount: matchAmount,
            },
          },
          { priceProvider, db, chainId }
        ),
        roundMetaPtrUpdated(
          {
            ...event,
            name: "RoundMetaPtrUpdated",
            address: event.params.roundAddress,
            params: {
              newMetaPtr: { pointer: metaPtr },
            },
          },
          { ipfsGet, db }
        ),
        applicationMetaPtrUpdated(
          {
            ...event,
            name: "ApplicationMetaPtrUpdated",
            address: event.params.roundAddress,
            params: {
              newMetaPtr: { pointer: applicationMetaPtr },
            },
          },
          { ipfsGet, db }
        ),
      ]);

      break;
    }

    case "MatchAmountUpdated": {
      return await matchAmountUpdated(event, { priceProvider, db, chainId });
    }

    case "RoundMetaPtrUpdated": {
      return await roundMetaPtrUpdated(event, { ipfsGet, db });
    }

    case "ApplicationMetaPtrUpdated": {
      return await applicationMetaPtrUpdated(event, { ipfsGet, db });
    }

    case "NewProjectApplication": {
      const projectId =
        event.params.project || event.params.projectID.toString();

      const applications = db.collection<Application>(
        `rounds/${event.address}/applications`
      );

      const projects = db.collection<Application>(
        `rounds/${event.address}/projects`
      );

      const applicationIndex =
        event.params.applicationIndex?.toString() ?? projectId;
      const application: Application = {
        id: applicationIndex,
        projectId: projectId,
        roundId: event.address,
        status: "PENDING",
        amountUSD: 0,
        votes: 0,
        uniqueContributors: 0,
        metadata: null,
        createdAtBlock: Number(event.blockNumber),
        statusUpdatedAtBlock: Number(event.blockNumber),
        statusSnapshots: [
          {
            status: "PENDING",
            statusUpdatedAtBlock: Number(event.blockNumber),
          },
        ],
      };

      await applications.insert(application);

      const isNewProject = await projects.upsertById(projectId, (p) => {
        return p ?? application;
      });

      await Promise.all([
        db.collection(
          `rounds/${event.address}/applications/${applicationIndex}/votes`
        ),
        db.collection(
          `rounds/${event.address}/applications/${applicationIndex}/contributors`
        ),
      ]);

      if (isNewProject) {
        await Promise.all([
          db.collection(`rounds/${event.address}/projects/${projectId}/votes`),
          db.collection(
            `rounds/${event.address}/projects/${projectId}/contributors`
          ),
        ]);
      }

      const metadata = await ipfsGet<Application["metadata"]>(
        event.params.applicationMetaPtr.pointer
      );

      if (metadata) {
        await Promise.all([
          applications.updateById(applicationIndex, (app) => ({
            ...app,
            metadata,
          })),
          projects.updateById(projectId, (project) => ({
            ...project,
            metadata,
          })),
        ]);
      }

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

        await Promise.all([
          db
            .collection<Application>(`rounds/${event.address}/projects`)
            .updateById(projectId, (application) => ({
              ...application,
              statusUpdatedAtBlock: Number(event.blockNumber),
              status: projectApp.status ?? application.status,
            })),
          db
            .collection<Application>(`rounds/${event.address}/applications`)
            .updateById(projectId, (application) => ({
              ...application,
              statusUpdatedAtBlock: Number(event.blockNumber),
              status: projectApp.status ?? application.status,
            })),
        ]);
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
        const statusString = ApplicationStatus[status] as Application["status"];
        const application = await db
          .collection<Application>(`rounds/${event.address}/applications`)
          .updateById(i.toString(), (application) =>
            updateApplicationStatus(
              application,
              statusString,
              Number(event.blockNumber)
            )
          );

        if (application) {
          await db
            .collection<Application>(`rounds/${event.address}/projects`)
            .updateById(application.projectId, (application) =>
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

    // --- Voting Strategy
    case "VotingContractCreatedV1": {
      subscribeToContract({
        contract: "QuadraticFundingVotingStrategyImplementationV1",
        address: event.params.votingContractAddress,
      });
      break;
    }

    case "VotingContractCreated": {
      subscribeToContract({
        contract: "QuadraticFundingVotingStrategyImplementationV2",
        address: event.params.votingContractAddress,
      });
      break;
    }

    // --- Votes
    case "Voted": {
      const voteId = ethers.utils.solidityKeccak256(
        ["string"],
        [`${event.blockNumber}-${event.logIndex}`]
      );

      const applicationId =
        event.params.applicationIndex?.toString() ??
        event.params.projectId.toString();

      // If an `origin` field is present, this event comes from MRC, thus ignore the
      // `voter` field because that's the contract. See AIP-13
      const realVoterAddress = event.params.origin ?? event.params.voter;

      const application = await db
        .collection<Application>(
          `rounds/${event.params.roundAddress}/applications`
        )
        .findById(applicationId);

      const round = await db
        .collection<Round>(`rounds`)
        .findById(event.params.roundAddress);

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

      const vote = {
        id: voteId,
        transaction: event.transactionHash,
        blockNumber: event.blockNumber,
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

      // Insert or update  unique round contributor
      const roundContributors = db.collection<Contributor>(
        `rounds/${event.params.roundAddress}/contributors`
      );

      const isNewRoundContributor = await roundContributors.upsertById(
        realVoterAddress,
        (contributor) => {
          if (contributor) {
            return {
              ...contributor,
              amountUSD: contributor.amountUSD + amountUSD,
              votes: contributor.votes + 1,
            };
          } else {
            return {
              id: realVoterAddress,
              amountUSD,
              votes: 1,
            };
          }
        }
      );

      // Insert or update unique project contributor
      const projectContributors = db.collection<Contributor>(
        `rounds/${event.params.roundAddress}/projects/${event.params.projectId}/contributors`
      );

      const isNewProjectContributor = await projectContributors.upsertById(
        realVoterAddress,
        (contributor) => {
          if (contributor) {
            return {
              ...contributor,
              amountUSD: contributor.amountUSD + amountUSD,
              votes: contributor.votes + 1,
            };
          } else {
            return {
              id: realVoterAddress,
              amountUSD,
              votes: 1,
            };
          }
        }
      );

      // Insert or update unique application contributor
      const applicationContributors = db.collection<Contributor>(
        `rounds/${event.params.roundAddress}/applications/${applicationId}/contributors`
      );

      const isNewapplicationContributor =
        await applicationContributors.upsertById(
          realVoterAddress,
          (contributor) => {
            if (contributor) {
              return {
                ...contributor,
                amountUSD: contributor.amountUSD + amountUSD,
                votes: contributor.votes + 1,
              };
            } else {
              return {
                id: realVoterAddress,
                amountUSD,
                votes: 1,
              };
            }
          }
        );

      await Promise.all([
        db
          .collection<Application>(
            `rounds/${event.params.roundAddress}/applications`
          )
          .updateById(applicationId, (project) => ({
            ...project,
            amountUSD: project.amountUSD + amountUSD,
            votes: project.votes + 1,
            uniqueContributors:
              project.uniqueContributors +
              (isNewapplicationContributor ? 1 : 0),
          })),
      ]);

      const contributorPartitionedPath = vote.voter
        .split(/(.{6})/)
        .filter((s: string) => s.length > 0)
        .join("/");

      await Promise.all([
        db
          .collection<DetailedVote>(
            `contributors/${contributorPartitionedPath}`
          )
          .insert({
            ...vote,
            roundName: round.metadata?.name,
            projectTitle: application.metadata?.application?.project?.title,
            roundStartTime: round.roundStartTime,
            roundEndTime: round.roundEndTime,
          }),
        db
          .collection<Round>("rounds")
          .updateById(event.params.roundAddress, (round) => ({
            ...round,
            amountUSD: round.amountUSD + amountUSD,
            votes: round.votes + 1,
            uniqueContributors:
              round.uniqueContributors + (isNewRoundContributor ? 1 : 0),
          })),
        db
          .collection<Application>(
            `rounds/${event.params.roundAddress}/projects`
          )
          .updateById(event.params.projectId, (project) => ({
            ...project,
            amountUSD: project.amountUSD + amountUSD,
            votes: project.votes + 1,
            uniqueContributors:
              project.uniqueContributors + (isNewProjectContributor ? 1 : 0),
          })),
        db
          .collection<Vote>(`rounds/${event.params.roundAddress}/votes`)
          .insert(vote),
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
        const application = await db
          .collection<Application>(`rounds/${round}/applications`)
          .findById(i.toString());

        // DirectPayoutStrategy uses status 1 for signaling IN REVIEW. In order to be considered as IN REVIEW the
        // application must be on PENDING status on the round
        if (application && application.status == "PENDING" && newStatus == 1) {
          const statusString = ApplicationStatus[4] as Application["status"];
          await db
            .collection<Application>(`rounds/${round}/applications`)
            .updateById(i.toString(), (application) =>
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
