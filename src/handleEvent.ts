import {
  Cache,
  Indexer as ChainsauceIndexer,
  JsonStorage,
  Event,
} from "chainsauce";
import { ethers } from "ethers";
import { fetchJson as ipfs } from "./ipfs.js";
import { getPrice } from "./coinGecko.js";

import RoundImplementationABI from "../abis/RoundImplementation.json" assert { type: "json" };
import QuadraticFundingImplementationABI from "../abis/QuadraticFundingVotingStrategyImplementation.json" assert { type: "json" };
import { writeFile } from "node:fs";

type Indexer = ChainsauceIndexer<JsonStorage>;

let blocks = 0;
let events = 0;

async function convertToUSD(
  token: string,
  amount: ethers.BigNumber,
  chainId: number,
  fromTimestamp: number,
  toTimestamp: number,
  cache: Cache
): Promise<number> {
  const cacheKey = `price-${token}-${chainId}-${toTimestamp}-${fromTimestamp}`;

  const price = await cache.lazy<number>(cacheKey, () => {
    console.log(cacheKey);
    return getPrice(token, chainId, fromTimestamp, toTimestamp);
  });

  if (price === 0) {
    console.warn("Price not found for token:", token, "chainId:", chainId);
  }

  const priceFixedNumber = ethers.FixedNumber.from(price.toFixed(2));
  const amountFixedNumber = ethers.FixedNumber.fromValue(amount, 18);

  const result = priceFixedNumber.mulUnsafe(amountFixedNumber).toUnsafeFloat();

  return result;
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
  const chainId = indexer.chainId;
  events++;
  console.log("events", events);

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

        const now = new Date();

        const startDate = new Date(round.roundStartTime * 1000);
        // if round ends in the future, end it now to get live data
        const endDate = new Date(round.roundEndTime * 1000);

        const amountUSD = await convertToUSD(
          event.args.token.toLowerCase(),
          event.args.amount,
          chainId,
          Math.floor(startDate.getTime() / 1000),
          Math.floor(Math.min(now.getTime(), endDate.getTime()) / 1000),
          indexer.cache
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
