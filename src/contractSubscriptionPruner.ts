import { Logger } from "pino";
import { Indexer } from "./indexer/indexer.js";
import { ContractName } from "./indexer/abis/index.js";
import { RpcClient } from "chainsauce/dist/rpc.js";

const CONTRACT_EXPIRATION_IN_DAYS: Partial<Record<ContractName, number>> = {
  "AlloV1/RoundImplementation/V1": 60,
  "AlloV1/RoundImplementation/V2": 60,
  "AlloV1/QuadraticFundingVotingStrategyImplementation/V2": 60,
  "AlloV1/DirectPayoutStrategyImplementation/V2": 60,
  "AlloV1/MerklePayoutStrategyImplementation/V2": 60,
};

export class ContractSubscriptionPruner {
  #client: RpcClient;
  #indexer: Indexer;
  #logger: Logger;

  #intervalMs = 10 * 60 * 1000; // 10 minutes

  #timer: NodeJS.Timeout | null = null;

  constructor(opts: { client: RpcClient; indexer: Indexer; logger: Logger }) {
    this.#client = opts.client;
    this.#indexer = opts.indexer;
    this.#logger = opts.logger;
  }

  start() {
    if (this.#timer !== null) {
      throw new Error("Pruner already started");
    }

    void this.#prune();
  }

  stop() {
    if (this.#timer === null) {
      throw new Error("Pruner not started");
    }

    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #scheduleNextPrune() {
    this.#timer = setTimeout(() => this.#prune(), this.#intervalMs);
  }

  async #prune(): Promise<void> {
    try {
      const subscriptions = this.#indexer.getSubscriptions();

      for (const subscription of subscriptions) {
        const expirationInDays =
          CONTRACT_EXPIRATION_IN_DAYS[
            subscription.contractName as ContractName
          ];

        if (expirationInDays === undefined) {
          continue;
        }

        const fromBlock = await this.#client.getBlockByNumber({
          number: subscription.fromBlock,
        });

        if (fromBlock === null) {
          continue;
        }

        const fromBlockDate = new Date(fromBlock.timestamp * 1000);

        const expirationDate = new Date(
          fromBlockDate.getTime() + expirationInDays * 24 * 60 * 60 * 1000
        );

        const now = new Date();

        if (expirationDate < now) {
          this.#logger.info({
            msg: "pruning contract",
            contractName: subscription.contractName,
            address: subscription.contractAddress,
          });
          this.#indexer.unsubscribeFromContract({
            address: subscription.contractAddress,
          });
        }
      }
    } catch (err) {
      this.#logger.error({
        msg: "pruner error",
        err,
      });
    } finally {
      this.#scheduleNextPrune();
    }
  }
}
