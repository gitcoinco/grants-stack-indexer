import { JsonStorage, Event as ChainsauceEvent } from "chainsauce";
import { BigNumber, ethers } from "ethers";
import StatusesBitmap from "statuses-bitmap";

import { CHAINS, tokenDecimals } from "../config.js";
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
import { importAbi } from "./utils.js";
import { PriceProvider } from "../prices/provider.js";

// Event handlers
import roundMetaPtrUpdated from "./handlers/roundMetaPtrUpdated.js";
import applicationMetaPtrUpdated from "./handlers/applicationMetaPtrUpdated.js";
import matchAmountUpdated from "./handlers/matchAmountUpdated.js";

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

// mapping of chain id => address => event name => renamed event name
const eventRenames = Object.fromEntries(
  CHAINS.map((chain) => {
    return [
      chain.id,
      Object.fromEntries(
        chain.subscriptions.map((sub) => [sub.address, sub.events])
      ),
    ];
  })
);

async function handleEvent(
  originalEvent: ChainsauceEvent,
  deps: {
    chainId: number;
    db: JsonStorage;
    subscribe: (
      address: string,
      abi: ethers.ContractInterface,
      fromBlock?: number | undefined
    ) => ethers.Contract;
    ipfsGet: <T>(cid: string) => Promise<T | undefined>;
    priceProvider: PriceProvider;
  }
) {
  const { db, subscribe, ipfsGet, priceProvider, chainId } = deps;

  const eventName =
    eventRenames[chainId]?.[originalEvent.address]?.[originalEvent.name] ??
    originalEvent.name;

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
        chainId,
        event.args.projectID.toNumber(),
        event.address
      );

      const metadata = await ipfsGet<Project["metadata"]>(
        event.args.metaPtr.pointer
      );

      await db.collection<Project>("projects").updateById(id, (project) => {
        return {
          ...project,
          metaPtr: event.args.metaPtr.pointer,
          metadata: metadata ?? null,
        };
      });

      break;
    }

    case "OwnerAdded": {
      const id = fullProjectId(
        chainId,
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
        chainId,
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
        contract = subscribe(
          event.args.roundAddress,
          await importAbi("#abis/v1/RoundImplementation.json"),
          event.blockNumber
        ) as RoundContract;
        matchAmountPromise = BigNumber.from("0");
      } else {
        contract = subscribe(
          event.args.roundAddress,
          await importAbi("#abis/v2/RoundImplementation.json"),
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

      if (tokenDecimals[chainId][token]) {
        await matchAmountUpdated(
          {
            ...event,
            name: "MatchAmountUpdated",
            address: event.args.roundAddress,
            args: {
              newAmount: matchAmount,
            },
          },
          { priceProvider, db, chainId }
        );
      }

      await roundMetaPtrUpdated(
        {
          ...event,
          name: "RoundMetaPtrUpdated",
          address: event.args.roundAddress,
          args: {
            newMetaPtr: { pointer: metaPtr },
          },
        },
        { ipfsGet, db }
      );

      await applicationMetaPtrUpdated(
        {
          ...event,
          name: "ApplicationMetaPtrUpdated",
          address: event.args.roundAddress,
          args: {
            newMetaPtr: { pointer: applicationMetaPtr },
          },
        },
        { ipfsGet, db }
      );

      break;
    }

    case "MatchAmountUpdated": {
      return matchAmountUpdated(event, { priceProvider, db, chainId });
    }

    case "RoundMetaPtrUpdated": {
      return roundMetaPtrUpdated(event, { ipfsGet, db });
    }

    case "ApplicationMetaPtrUpdated": {
      return applicationMetaPtrUpdated(event, { ipfsGet, db });
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

      const metadata = await ipfsGet<Application["metadata"]>(
        event.args.applicationMetaPtr.pointer
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
      const projects = await ipfsGet<
        { id: string; status: Application["status"]; payoutAddress: string }[]
      >(event.args.newMetaPtr.pointer);

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
      subscribe(
        event.args.votingContractAddress,
        await importAbi(
          "#abis/v1/QuadraticFundingVotingStrategyImplementation.json"
        ),
        event.blockNumber
      );
      break;
    }

    case "VotingContractCreatedV3": {
      subscribe(
        event.args.votingContractAddress,
        await importAbi(
          "#abis/v3/QuadraticFundingVotingStrategyImplementation.json"
        ),
        event.blockNumber
      );
      break;
    }

    case "VotingContractCreated": {
      subscribe(
        event.args.votingContractAddress,
        await importAbi(
          "#abis/v2/QuadraticFundingVotingStrategyImplementation.json"
        ),
        event.blockNumber
      );
      break;
    }

    // --- Votes
    case "Voted": {
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

      const conversionUSD = await priceProvider.convertToUSD(
        chainId,
        token,
        event.args.amount.toBigInt(),
        event.blockNumber
      );

      const amountUSD = conversionUSD.amount;

      const amountRoundToken =
        round.token === token
          ? event.args.amount.toString()
          : (
              await priceProvider.convertFromUSD(
                chainId,
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
        voter: event.args.origin ?? event.args.voter,
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
            project.uniqueContributors + (isNewapplicationContributor ? 1 : 0),
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
          .collection<Application>(`rounds/${event.args.roundAddress}/projects`)
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

      break;
    }

    default:
    // console.log("TODO", event.name, event.args);
  }
}

export default handleEvent;
