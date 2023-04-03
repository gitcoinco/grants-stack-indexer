import {
  Cache,
  Indexer as ChainsauceIndexer,
  JsonStorage,
  Event,
} from "chainsauce";
import { ethers } from "ethers";
import { fetchJson as ipfs } from "./ipfs.js";
import type { Price } from "./cli/prices.js";

import RoundImplementationABI from "../abis/RoundImplementation.json" assert { type: "json" };
import QuadraticFundingImplementationABI from "../abis/QuadraticFundingVotingStrategyImplementation.json" assert { type: "json" };

type Indexer = ChainsauceIndexer<JsonStorage>;

async function convertToUSD(
  prices: Price[],
  token: string,
  amount: bigint,
  blockNumber: number,
  decimals: number
): Promise<number> {
  let closestPrice = null;
  for (let i = prices.length - 1; i >= 0; i--) {
    const price = prices[i];
    if (price.token === token && price.block < blockNumber) {
      closestPrice = price;
      break;
    }
  }

  if (closestPrice) {
    const decimalFactor = 10n ** BigInt(decimals);
    const price = BigInt(Math.trunc(closestPrice.price * 100)) * decimalFactor;
    return Number((amount * price) / decimalFactor) / 100;
  }

  throw "Price not found";
}

async function cachedIpfs<T>(cid: string, cache: Cache): Promise<T> {
  return await cache.lazy<T>(`ipfs-${cid}`, () => ipfs<T>(cid));
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

async function handleEvent(indexer: Indexer, event: Event) {
  const db = indexer.storage;

  switch (event.name) {
    // -- PROJECTS
    case "ProjectCreated": {
      await db.collection("projects").insert({
        id: fullProjectId(
          indexer.chainId,
          event.args.projectID.toNumber(),
          event.address
        ),
        projectNumber: event.args.projectID.toNumber(),
        metaPtr: null,
        owners: [event.args.owner],
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
        await db.collection("projects").updateById(id, (project) => ({
          ...project,
          metaPtr: event.args.metaPtr.pointer,
        }));

        return async () => {
          const metadata = await cachedIpfs(
            event.args.metaPtr.pointer,
            indexer.cache
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.collection("projects").updateById(id, (project: any) => {
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

      await db.collection("projects").updateById(id, (project) => ({
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

      await db.collection("projects").updateById(id, (project) => ({
        ...project,
        owners: project.owners.filter((o: string) => o == event.args.owner),
      }));
      break;
    }

    // --- ROUND
    case "RoundCreated": {
      const contract = indexer.subscribe(
        event.args.roundAddress,
        RoundImplementationABI,
        event.blockNumber
      );

      let applicationMetaPtr = contract.applicationMetaPtr();
      let applicationsStartTime = contract.applicationsStartTime();
      let applicationsEndTime = contract.applicationsEndTime();
      let roundStartTime = contract.roundStartTime();
      let roundEndTime = contract.roundEndTime();
      let applicationMetadata = await cachedIpfs(
        (
          await applicationMetaPtr
        ).pointer,
        indexer.cache
      );

      applicationMetaPtr = (await applicationMetaPtr).pointer;
      applicationMetadata = await applicationMetadata;
      applicationsStartTime = (await applicationsStartTime).toString();
      applicationsEndTime = (await applicationsEndTime).toString();
      roundStartTime = (await roundStartTime).toString();
      roundEndTime = (await roundEndTime).toString();

      await db.collection("rounds").insert({
        id: event.args.roundAddress,
        amountUSD: 0,
        votes: 0,
        uniqueContributors: 0,
        applicationMetaPtr,
        applicationMetadata,
        applicationsStartTime,
        applicationsEndTime,
        roundStartTime,
        roundEndTime,
      });
      break;
    }

    case "NewProjectApplication": {
      const project = await db
        .collection("projects")
        .findById(event.args.project);

      await db.collection(`rounds/${event.address}/projects`).insert({
        id: event.args.project,
        projectNumber: project?.projectNumber ?? null,
        roundId: event.address,
        status: null,
        amountUSD: 0,
        votes: 0,
        uniqueContributors: 0,
        payoutAddress: null,
      });
      break;
    }

    case "ProjectsMetaPtrUpdated": {
      const projects: { id: string; status: string; payoutAddress: string }[] =
        await cachedIpfs(event.args.newMetaPtr.pointer, indexer.cache);

      for (const projectApp of projects) {
        const projectId = projectApp.id.split("-")[0];

        await db
          .collection(`rounds/${event.address}/projects`)
          .updateById(projectId, (application) => ({
            ...application,
            status: projectApp.status,
            payoutAddress: projectApp.payoutAddress,
          }));
      }
      break;
    }

    // --- Voting Strategy
    case "VotingContractCreated": {
      indexer.subscribe(
        event.args.votingContractAddress,
        QuadraticFundingImplementationABI,
        event.blockNumber
      );
      break;
    }

    // --- Votes
    case "Voted": {
      return async () => {
        const voteId = ethers.utils.solidityKeccak256(
          ["string"],
          [
            `${event.transactionHash}-${event.args.voter}-${event.args.grantAddress}`,
          ]
        );

        const projectApplication = await db
          .collection(`rounds/${event.args.roundAddress}/projects`)
          .findById(event.args.projectId);

        const round = await db
          .collection(`rounds`)
          .findById(event.args.roundAddress);

        if (
          projectApplication === undefined ||
          projectApplication.status !== "APPROVED" ||
          round === undefined
        ) {
          // TODO: We seem to be ceceiving votes for projects that have been rejected? Here's an example:
          // Project ID: 0x79f3e178005bfbe0a3defff8693009bb12e58102763501e52995162820ae3560
          // Round ID: 0xd95a1969c41112cee9a2c931e849bcef36a16f4c
          return;
        }

        const prices = await db.collection<Price>("prices").all();

        const amountUSD = convertToUSD(
          prices,
          event.args.token.toLowerCase(),
          event.args.amount.toBigInt(),
          event.blockNumber,
          18
        );

        const vote = {
          id: voteId,
          projectId: event.args.projectId,
          roundId: event.args.roundAddress,
          token: event.args.token,
          voter: event.args.voter,
          grantAddress: event.args.grantAddress,
          amount: event.args.amount.toString(),
          amountUSD: amountUSD,
        };

        // Insert or update  unique round contributor
        const roundContributors = db.collection(
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
        const projectContributors = db.collection(
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

        await Promise.all([
          db
            .collection("rounds")
            .updateById(event.args.roundAddress, (round) => ({
              ...round,
              amountUSD: round.amountUSD + amountUSD,
              votes: round.votes + 1,
              uniqueContributors:
                round.uniqueContributors + (isNewRoundContributor ? 1 : 0),
            })),
          db
            .collection(`rounds/${event.args.roundAddress}/projects`)
            .updateById(event.args.projectId, (project) => ({
              ...project,
              amountUSD: project.amountUSD + amountUSD,
              votes: project.votes + 1,
              uniqueContributors:
                project.uniqueContributors + (isNewProjectContributor ? 1 : 0),
            })),
          db.collection(`rounds/${event.args.roundAddress}/votes`).insert(vote),
          db
            .collection(
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
