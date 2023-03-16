import { Indexer as ChainsauceIndexer, JsonStorage, Event } from "chainsauce";
import { ethers } from "ethers";

import { fetchJson as ipfs } from "./ipfs.js";

import RoundImplementationABI from "../abis/RoundImplementation.json" assert { type: "json" };
import QuadraticFundingImplementationABI from "../abis/QuadraticFundingVotingStrategyImplementation.json" assert { type: "json" };

type Indexer = ChainsauceIndexer<JsonStorage>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function convertToUSD(_token: string, _amount: ethers.BigNumber) {
  // TODO
  return 0;
}

async function cachedIpfs<T>(indexer: Indexer, cid: string): Promise<T> {
  return await indexer.cache.lazy<T>(`ipfs-${cid}`, () => ipfs<T>(cid));
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
      db.collection("projects").insert({
        fullId: fullProjectId(
          indexer.chainId,
          event.args.projectID.toNumber(),
          event.address
        ),
        id: event.args.projectID.toNumber(),
        metaPtr: null,
        votesUSD: 0,
        votes: 0,
        owners: [event.args.owner],
      });

      break;
    }

    case "MetadataUpdated": {
      const metadata = await cachedIpfs(indexer, event.args.metaPtr.pointer);

      try {
        db.collection("projects").updateById(
          event.args.projectID.toNumber(),
          (project) => ({
            ...project,
            metaPtr: event.args.metaPtr.pointer,
            metadata: metadata,
          })
        );
      } catch (e) {
        console.error("Project not found", event.args.projectID.toNumber());
      }
      break;
    }

    case "OwnerAdded": {
      db.collection("projects").updateById(
        event.args.projectID.toNumber(),
        (project) => ({
          ...project,
          owners: [...project.owners, event.args.owner],
        })
      );
      break;
    }

    case "OwnerRemoved": {
      db.collection("projects").updateById(
        event.args.projectID.toNumber(),
        (project) => ({
          ...project,
          owners: project.owners.filter((o: string) => o == event.args.owner),
        })
      );
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
        indexer,
        (
          await applicationMetaPtr
        ).pointer
      );

      applicationMetaPtr = await applicationMetaPtr;
      applicationMetadata = await applicationMetadata;
      applicationsStartTime = (await applicationsStartTime).toString();
      applicationsEndTime = (await applicationsEndTime).toString();
      roundStartTime = (await roundStartTime).toString();
      roundEndTime = (await roundEndTime).toString();

      db.collection("rounds").insert({
        id: event.args.roundAddress,
        votesUSD: 0,
        votes: 0,
        implementationAddress: event.args.roundImplementation,
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
        .findOneWhere((project) => project.fullId == event.args.project);

      db.collection(`rounds/${event.address}/projects`).insert({
        id: event.args.project,
        projectId: project?.id ?? null,
        roundId: event.address,
        status: null,
      });
      break;
    }

    case "ProjectsMetaPtrUpdated": {
      const projects: { id: string; status: string; payoutAddress: string }[] =
        await cachedIpfs(indexer, event.args.newMetaPtr.pointer);

      for (const projectApp of projects) {
        const projectId = projectApp.id.split("-")[0];

        db.collection(`rounds/${event.address}/projects`).updateById(
          projectId,
          (application) => ({
            ...application,
            status: projectApp.status,
            payoutAddress: projectApp.payoutAddress,
          })
        );
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
      const amountUSD = convertToUSD(event.args.token, event.args.amount);

      const projectApplicationId = [
        event.args.projectId,
        event.args.roundAddress,
      ].join("-");

      const voteId = ethers.utils.solidityKeccak256(
        ["string"],
        [
          `${event.transactionHash}-${event.args.voter}-${event.args.grantAddress}`,
        ]
      );

      const projectApplication = await db
        .collection(`rounds/${event.address}/projects`)
        .findOneWhere((project) => project.id == event.args.projectId);

      if (
        projectApplication === undefined ||
        projectApplication.status !== "APPROVED"
      ) {
        // discard vote?
      }

      const vote = {
        id: voteId,
        token: event.args.token,
        voter: event.args.voter,
        grantAddress: event.args.grantAddress,
        amount: event.args.amount.toString(),
        amountUSD,
        fullProjectId: event.args.projectId,
        roundAddress: event.args.roundAddress,
        projectApplicationId: projectApplicationId,
      };

      db.collection(`rounds/${event.args.roundAddress}/votes`).insert(vote);
      db.collection(
        `rounds/${event.args.roundAddress}/projects/${event.args.projectId}/votes`
      ).insert(vote);
      break;
    }

    default:
    // console.log("TODO", event.name, event.args);
  }
}

export default handleEvent;
