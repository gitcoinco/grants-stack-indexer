import {Indexer as ChainsauceIndexer, JsonStorage, Event} from "chainsauce";
import {ethers} from "ethers";
import cache from 'memory-cache';
import {fetchJson as ipfs} from "./ipfs.js";

import RoundImplementationABI from "../abis/RoundImplementation.json" assert {type: "json"};
import QuadraticFundingImplementationABI
    from "../abis/QuadraticFundingVotingStrategyImplementation.json" assert {type: "json"};

type Indexer = ChainsauceIndexer<JsonStorage>;

const CHAIN = {
  1: "ethereum",
  250: "fantom",
  10: "optimism",
};

async function getPriceFromCoinGecko(token: string, chainId) {
  const chain = CHAIN[chainId];
  if (token === ethers.constants.AddressZero) {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${chain}&vs_currencies=usd`);
      const data = await response.json();
      return data[chain]?.usd || 0;
  } else {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/${chain}?contract_addresses=${token.toLowerCase()}&vs_currencies=usd`);
      const data = await response.json();
      return data[token]?.usd || 0;
  }

}

function isCacheExpired(cacheKey: string, expiresInMinutes: number) {
  const currentTime = new Date().getTime();
  const entry = cache.get(cacheKey);

  if (!entry) {
      return true;
  }

  return (currentTime - entry.timestamp) / 1000 > expiresInMinutes * 60;
}

async function convertToUSD(token: string, amount: ethers.BigNumber, chainId: number) {

  if (!CHAIN[chainId]) {
      console.log("Chain token prices not supported", chainId);
      return 0;
  }

  const cacheKey = `${token}-price-chain-${chainId}`;

  if (isCacheExpired(cacheKey, 1)) {
      const price = await getPriceFromCoinGecko(token, chainId);
      cache.put(cacheKey, {price, timestamp: new Date().getTime(), chainId});
  }

  const cachedPrice = cache.get(cacheKey).price;
  if (cachedPrice === 0) {
      console.log("Price not found for token", token, "using 0 instead");
  }
  return (Number(ethers.utils.formatUnits(amount, 18)) * cachedPrice).toFixed(2); 
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
    const chainId = indexer.chainId;

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
            const project = db
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
            const amountUSD = await convertToUSD(event.args.token.toLowerCase(), event.args.amount, chainId);

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

            const projectApplication = db
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
                amountUSD: amountUSD,
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
