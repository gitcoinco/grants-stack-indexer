import { Indexer, JsonStorage, Event as ChainsauceEvent } from "chainsauce";
import { BigNumber, ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

import { fetchJsonCached as ipfs } from "../utils/ipfs.js";
import { convertToUSD, convertFromUSD } from "../prices/index.js";
import { eventRenames, tokenDecimals } from "../config.js";
import {
  Application,
  Contributor,
  DetailedVote,
  Project,
  Round,
  Vote,
} from "./types.js";
import { Event } from "./events.js";
import { RoundContract } from "./contracts.js";

// Event handlers
import roundMetaPtrUpdated from "./handlers/roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./handlers/applicationMetaPtrUpdated.js";
import matchAmountUpdated from "./handlers/matchAmountUpdated.js";

type MetaPtr = { pointer: string };

enum ApplicationStatus {
  PENDING = 0,
  APPROVED,
  REJECTED,
  CANCELLED,
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

async function handleEvent(
  indexer: Indexer<JsonStorage>,
  originalEvent: ChainsauceEvent
) {
  const db = indexer.storage;
  const eventName =
    eventRenames[indexer.chainId]?.[originalEvent.address]?.[
      originalEvent.name
    ] ?? originalEvent.name;

  const event = {
    ...originalEvent,
    name: eventName,
  } as Event;

  switch (event.name) {
    // -- PROJECTS
    case "ProjectCreated": {
      await db.collection<Project>("projects").insert({
        id: fullProjectId(
          indexer.chainId,
          event.args.projectID.toNumber(),
          event.address
        ),
        projectNumber: event.args.projectID.toNumber(),
        metaPtr: null,
        metadata: null,
        owners: [event.args.owner],
        createdAtBlock: event.blockNumber,
      });

      break;
    }

    case "MetadataUpdated": {
      const id = fullProjectId(
        indexer.chainId,
        event.args.projectID.toNumber(),
        event.address
      );

      try {
        await db.collection<Project>("projects").updateOneWhere(
          (p) => p.projectNumber === event.args.projectID.toNumber(),
          (project) => ({
            ...project,
            metaPtr: event.args.metaPtr.pointer,
          })
        );

        return async () => {
          const metadata = await ipfs<Project["metadata"]>(
            (event.args.metaPtr as MetaPtr).pointer,
            indexer.cache
          );

          if (!metadata) {
            return;
          }

          await db.collection<Project>("projects").updateById(id, (project) => {
            if (project.metaPtr === event.args.metaPtr.pointer) {
              return { ...project, metadata };
            }

            return project;
          });
        };
      } catch (e) {
        console.error("Project not found", event.args.projectID.toNumber());
      }
      break;
    }

    case "OwnerAdded": {
      const id = fullProjectId(
        indexer.chainId,
        event.args.projectID.toNumber(),
        event.address
      );

      await db.collection<Project>("projects").updateById(id, (project) => ({
        ...project,
        owners: [...project.owners, event.args.owner],
      }));
      break;
    }

    case "OwnerRemoved": {
      const id = fullProjectId(
        indexer.chainId,
        event.args.projectID.toNumber(),
        event.address
      );

      await db.collection<Project>("projects").updateById(id, (project) => ({
        ...project,
        owners: project.owners.filter((o: string) => o == event.args.owner),
      }));
      break;
    }

    // --- ROUND
    case "RoundCreatedV1":
    case "RoundCreated": {
      let contract: RoundContract;

      let matchAmountPromise;

      if (event.name === "RoundCreatedV1") {
        contract = indexer.subscribe(
          event.args.roundAddress,
          (
            await import("#abis/v1/RoundImplementation.json", {
              assert: { type: "json" },
            })
          ).default,
          event.blockNumber
        ) as RoundContract;
        matchAmountPromise = BigNumber.from("0");
      } else {
        contract = indexer.subscribe(
          event.args.roundAddress,
          (
            await import("#abis/v2/RoundImplementation.json", {
              assert: { type: "json" },
            })
          ).default,
          event.blockNumber
        ) as RoundContract;
        matchAmountPromise = contract.matchAmount();
      }

      const applicationMetaPtrPromise = contract.applicationMetaPtr();
      const metaPtrPromise = contract.roundMetaPtr();
      const tokenPromise = contract.token();
      const applicationsStartTimePromise = contract.applicationsStartTime();
      const applicationsEndTimePromise = contract.applicationsEndTime();
      const roundStartTimePromise = contract.roundStartTime();
      const roundEndTimePromise = contract.roundEndTime();

      const applicationMetaPtr = (await applicationMetaPtrPromise).pointer;
      const metaPtr = (await metaPtrPromise).pointer;
      const token = (await tokenPromise).toString().toLowerCase();
      const matchAmount = await matchAmountPromise;
      const applicationsStartTime = (
        await applicationsStartTimePromise
      ).toString();
      const applicationsEndTime = (await applicationsEndTimePromise).toString();
      const roundStartTime = (await roundStartTimePromise).toString();
      const roundEndTime = (await roundEndTimePromise).toString();

      const roundId = event.args.roundAddress;

      await db.collection<Round>("rounds").insert({
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
        createdAtBlock: event.blockNumber,
        updatedAtBlock: event.blockNumber,
      });

      // create empty sub collections
      await db.collection(`rounds/${roundId}/projects`).replaceAll([]);
      await db.collection(`rounds/${roundId}/applications`).replaceAll([]);
      await db.collection(`rounds/${roundId}/votes`).replaceAll([]);
      await db.collection(`rounds/${roundId}/contributors`).replaceAll([]);

      if (tokenDecimals[indexer.chainId][token]) {
        await matchAmountUpdated(indexer, {
          ...event,
          name: "MatchAmountUpdated",
          address: event.args.roundAddress,
          args: {
            newAmount: matchAmount,
          },
        });
      }

      await roundMetaPtrUpdated(indexer, {
        ...event,
        name: "RoundMetaPtrUpdated",
        address: event.args.roundAddress,
        args: {
          newMetaPtr: { pointer: metaPtr },
        },
      });

      await applicationMetaPtrUpdated(indexer, {
        ...event,
        name: "ApplicationMetaPtrUpdated",
        address: event.args.roundAddress,
        args: {
          newMetaPtr: { pointer: applicationMetaPtr },
        },
      });

      break;
    }

    case "MatchAmountUpdated": {
      return matchAmountUpdated(indexer, event);
    }

    case "RoundMetaPtrUpdated": {
      return roundMetaPtrUpdated(indexer, event);
    }

    case "ApplicationMetaPtrUpdated": {
      return applicationMetaPtrUpdated(indexer, event);
    }

    case "NewProjectApplication": {
      const projectId = event.args.project || event.args.projectID.toString();

      const applications = db.collection<Application>(
        `rounds/${event.address}/applications`
      );

      const projects = db.collection<Application>(
        `rounds/${event.address}/projects`
      );

      const applicationIndex =
        event.args.applicationIndex?.toString() ?? projectId;
      const application: Application = {
        id: applicationIndex,
        projectId: projectId,
        roundId: event.address,
        status: "PENDING",
        amountUSD: 0,
        votes: 0,
        uniqueContributors: 0,
        metadata: null,
        createdAtBlock: event.blockNumber,
        statusUpdatedAtBlock: event.blockNumber,
      };

      await applications.insert(application);

      const isNewProject = await projects.upsertById(projectId, (p) => {
        return p ?? application;
      });

      await db
        .collection(
          `rounds/${event.address}/applications/${applicationIndex}/votes`
        )
        .replaceAll([]);

      await db
        .collection(
          `rounds/${event.address}/applications/${applicationIndex}/contributors`
        )
        .replaceAll([]);

      if (isNewProject) {
        await db
          .collection(`rounds/${event.address}/projects/${projectId}/votes`)
          .replaceAll([]);

        await db
          .collection(
            `rounds/${event.address}/projects/${projectId}/contributors`
          )
          .replaceAll([]);
      }

      const metadata = await ipfs<Application["metadata"]>(
        event.args.applicationMetaPtr.pointer,
        indexer.cache
      );

      if (metadata) {
        await applications.updateById(applicationIndex, (app) => ({
          ...app,
          metadata,
        }));

        await projects.updateById(projectId, (project) => ({
          ...project,
          metadata,
        }));
      }

      break;
    }

    case "ProjectsMetaPtrUpdated": {
      const projects = await ipfs<
        { id: string; status: Application["status"]; payoutAddress: string }[]
      >(event.args.newMetaPtr.pointer, indexer.cache);

      if (!projects) {
        return;
      }

      for (const projectApp of projects) {
        const projectId = projectApp.id.split("-")[0];

        await db
          .collection<Application>(`rounds/${event.address}/projects`)
          .updateById(projectId, (application) => ({
            ...application,
            statusUpdatedAtBlock: event.blockNumber,
            status: projectApp.status ?? application.status,
          }));

        await db
          .collection<Application>(`rounds/${event.address}/applications`)
          .updateById(projectId, (application) => ({
            ...application,
            statusUpdatedAtBlock: event.blockNumber,
            status: projectApp.status ?? application.status,
          }));
      }
      break;
    }

    case "ApplicationStatusesUpdated": {
      const bitmap = new StatusesBitmap(256n, 2n);
      bitmap.setRow(event.args.index.toBigInt(), event.args.status.toBigInt());
      const startIndex = event.args.index.toBigInt() * bitmap.itemsPerRow;

      for (let i = startIndex; i < startIndex + bitmap.itemsPerRow; i++) {
        const status = bitmap.getStatus(i);
        const statusString = ApplicationStatus[status];
        const application = await db
          .collection<Application>(`rounds/${event.address}/applications`)
          .updateById(i.toString(), (application) => ({
            ...application,
            status: statusString as Application["status"],
            statusUpdatedAtBlock: event.blockNumber,
          }));

        if (application) {
          await db
            .collection<Application>(`rounds/${event.address}/projects`)
            .updateById(application.projectId, (application) => ({
              ...application,
              status: statusString as Application["status"],
              statusUpdatedAtBlock: event.blockNumber,
            }));
        }
      }
      break;
    }

    // --- Voting Strategy
    case "VotingContractCreatedV1": {
      indexer.subscribe(
        event.args.votingContractAddress,
        (
          await import(
            "#abis/v1/QuadraticFundingVotingStrategyImplementation.json",
            {
              assert: { type: "json" },
            }
          )
        ).default,
        event.blockNumber
      );
      break;
    }

    case "VotingContractCreated": {
      indexer.subscribe(
        event.args.votingContractAddress,
        (
          await import(
            "#abis/v2/QuadraticFundingVotingStrategyImplementation.json",
            {
              assert: { type: "json" },
            }
          )
        ).default,
        event.blockNumber
      );
      break;
    }

    // --- Votes
    case "Voted": {
      return async () => {
        const voteId = ethers.utils.solidityKeccak256(
          ["string"],
          [`${event.blockNumber}-${event.logIndex}`]
        );

        const applicationId =
          event.args.applicationIndex?.toString() ??
          event.args.projectId.toString();

        const application = await db
          .collection<Application>(
            `rounds/${event.args.roundAddress}/applications`
          )
          .findById(applicationId);

        const round = await db
          .collection<Round>(`rounds`)
          .findById(event.args.roundAddress);

        if (
          application === undefined ||
          application.status !== "APPROVED" ||
          round === undefined
        ) {
          return;
        }

        const token = event.args.token.toLowerCase();

        const conversionUSD = await convertToUSD(
          indexer.chainId,
          token,
          event.args.amount.toBigInt(),
          event.blockNumber
        );

        const amountUSD = conversionUSD.amount;

        const amountRoundToken =
          round.token === token
            ? event.args.amount.toString()
            : (
                await convertFromUSD(
                  indexer.chainId,
                  round.token,
                  conversionUSD.amount,
                  event.blockNumber
                )
              ).amount.toString();

        const vote = {
          id: voteId,
          transaction: event.transactionHash,
          blockNumber: event.blockNumber,
          projectId: event.args.projectId,
          applicationId: applicationId,
          roundId: event.args.roundAddress,
          voter: event.args.voter,
          grantAddress: event.args.grantAddress,
          token: event.args.token,
          amount: event.args.amount.toString(),
          amountUSD: amountUSD,
          amountRoundToken,
        };

        // Insert or update  unique round contributor
        const roundContributors = db.collection<Contributor>(
          `rounds/${event.args.roundAddress}/contributors`
        );

        const isNewRoundContributor = await roundContributors.upsertById(
          event.args.voter,
          (contributor) => {
            if (contributor) {
              return {
                ...contributor,
                amountUSD: contributor.amountUSD + amountUSD,
                votes: contributor.votes + 1,
              };
            } else {
              return {
                id: event.args.voter,
                amountUSD,
                votes: 1,
              };
            }
          }
        );

        // Insert or update unique project contributor
        const projectContributors = db.collection<Contributor>(
          `rounds/${event.args.roundAddress}/projects/${event.args.projectId}/contributors`
        );

        const isNewProjectContributor = await projectContributors.upsertById(
          event.args.voter,
          (contributor) => {
            if (contributor) {
              return {
                ...contributor,
                amountUSD: contributor.amountUSD + amountUSD,
                votes: contributor.votes + 1,
              };
            } else {
              return {
                id: event.args.voter,
                amountUSD,
                votes: 1,
              };
            }
          }
        );

        // Insert or update unique application contributor
        const applicationContributors = db.collection<Contributor>(
          `rounds/${event.args.roundAddress}/applications/${applicationId}/contributors`
        );

        const isNewapplicationContributor =
          await applicationContributors.upsertById(
            event.args.voter,
            (contributor) => {
              if (contributor) {
                return {
                  ...contributor,
                  amountUSD: contributor.amountUSD + amountUSD,
                  votes: contributor.votes + 1,
                };
              } else {
                return {
                  id: event.args.voter,
                  amountUSD,
                  votes: 1,
                };
              }
            }
          );

        await db
          .collection<Application>(
            `rounds/${event.args.roundAddress}/applications`
          )
          .updateById(applicationId, (project) => ({
            ...project,
            amountUSD: project.amountUSD + amountUSD,
            votes: project.votes + 1,
            uniqueContributors:
              project.uniqueContributors +
              (isNewapplicationContributor ? 1 : 0),
          }));

        await db
          .collection<Vote>(
            `rounds/${event.args.roundAddress}/applications/${applicationId}/votes`
          )
          .insert(vote);

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
              projectTitle: application.metadata?.application.project.title,
              roundStartTime: round.roundStartTime,
              roundEndTime: round.roundEndTime,
            }),
          db
            .collection<Round>("rounds")
            .updateById(event.args.roundAddress, (round) => ({
              ...round,
              amountUSD: round.amountUSD + amountUSD,
              votes: round.votes + 1,
              uniqueContributors:
                round.uniqueContributors + (isNewRoundContributor ? 1 : 0),
            })),
          db
            .collection<Application>(
              `rounds/${event.args.roundAddress}/projects`
            )
            .updateById(event.args.projectId, (project) => ({
              ...project,
              amountUSD: project.amountUSD + amountUSD,
              votes: project.votes + 1,
              uniqueContributors:
                project.uniqueContributors + (isNewProjectContributor ? 1 : 0),
            })),
          db
            .collection<Vote>(`rounds/${event.args.roundAddress}/votes`)
            .insert(vote),
          db
            .collection<Vote>(
              `rounds/${event.args.roundAddress}/projects/${event.args.projectId}/votes`
            )
            .insert(vote),
        ]);
      };
    }

    default:
    // console.log("TODO", event.name, event.args);
  }
}

export default handleEvent;
