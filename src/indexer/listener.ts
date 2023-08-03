import {
  RetryProvider,
  createIndexer,
  JsonStorage,
  Indexer,
  Event as ChainsauceEvent,
  ToBlock,
} from "chainsauce";
import { Logger } from "pino";
import { createReadStream, createWriteStream } from "node:fs";
import readline from "node:readline";
import { ethers } from "ethers";
import { Chain } from "../config.js";
import { importAbi } from "./utils.js";
import { BigNumber } from "ethers";

export const createBlockchainListener = ({
  logger,
  onEvent,
  onCaughtUp,
  eventLogPath,
  rpcProvider,
  storage,
  toBlock,
  chain,
}: {
  logger: Logger;
  onEvent: (
    event: ChainsauceEvent,
    onContractRequested: (
      address: string,
      abi: ethers.ContractInterface
    ) => void
  ) => Promise<void>;
  onCaughtUp: () => void;
  eventLogPath: string;
  rpcProvider: RetryProvider;
  storage: JsonStorage;
  toBlock: ToBlock;
  chain: Chain;
}) => {
  const POLL_INTERVAL_MS = 20000;
  let state: "starting" | "replaying" | "listening" | "stopped" = "starting";
  let isCaughtUp: boolean = false;
  let pollTimeoutId: NodeJS.Timeout;
  let indexer: Indexer<JsonStorage> | null = null;

  // Store subscriptions requested during replay and activate them all when replay is done
  const delayedSubscriptions: Array<{
    address: string;
    abi: ethers.ContractInterface;
  }> = [];

  const eventLogStream = createWriteStream(eventLogPath, { flags: "a" });

  const start = async () => {
    // XXX should be in the outer scope but it's async and we don't want to leak
    // that. Longer term, make createIndexer sync
    indexer = await createIndexer(
      rpcProvider,
      storage,
      (_indexer: Indexer<JsonStorage>, chainsauceEvent: ChainsauceEvent) => {
        const event = fixChainsauceEvent(chainsauceEvent);
        logger.debug(`handling live event (block number ${event.blockNumber})`);
        eventLogStream.write(JSON.stringify(event) + "\n");
        return onEvent(event, onContractRequested);
      },
      {
        requireExplicitStart: true,
        toBlock,
        logger: logger.child({ subsystem: "DataUpdater" }),
        eventCacheDirectory: null,
        onProgress: ({ currentBlock, lastBlock }) => {
          logger.debug(
            `indexed to block ${currentBlock}; last block on chain: ${lastBlock}`
          );
          if (!isCaughtUp && currentBlock === lastBlock) {
            logger.info("caught up with blockchain events");
            isCaughtUp = true;
            onCaughtUp();
          }
        },
      }
    );

    const { lastReplayedEventBlockNumber } = await replayLoggedEvents();

    listenToLiveEvents({
      startingBlock:
        lastReplayedEventBlockNumber === null
          ? 0
          : lastReplayedEventBlockNumber + 1,
    });
  };

  const stop = () => {
    clearTimeout(pollTimeoutId);
  };

  const listenToLiveEvents = async ({
    startingBlock,
  }: {
    startingBlock: number;
  }) => {
    state = "listening";
    if (indexer === null) {
      throw new Error("chainsauce indexer not initialized");
    }

    for (const subscription of chain.subscriptions) {
      indexer.subscribe(
        subscription.address,
        // XXX replace with statically imported ABIs to remove async
        await importAbi(subscription.abi),
        Math.max(startingBlock + 1, subscription.fromBlock ?? 0)
      );
    }

    for (const subscription of delayedSubscriptions) {
      indexer.subscribe(
        subscription.address,
        subscription.abi,
        startingBlock + 1
      );
    }

    void poll();
  };

  // We take control of the update loop by creating the ChainSauce indexer with
  // `requireExplicitStart: true`, *not* calling `indexer.start()`, and then
  // calling `indexer.updateOnce` inside our own polling loop.
  const poll = async () => {
    if (indexer === null) {
      throw new Error("chainsauce indexer not initialized");
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- false negative?
    await indexer.updateOnce();
    pollTimeoutId = setTimeout(poll, POLL_INTERVAL_MS);
  };

  const onContractRequested = (
    address: string,
    abi: ethers.ContractInterface
  ) => {
    switch (state) {
      case "replaying": {
        delayedSubscriptions.push({ address, abi });
        break;
      }
      case "listening": {
        if (indexer === null) {
          throw new Error("chainsauce indexer not initialized");
        }
        indexer.subscribe(address, abi);
        break;
      }
      default:
        throw new Error(`Invalid state: ${state}`);
    }
  };

  const replayLoggedEvents = async (): Promise<{
    lastReplayedEventBlockNumber: number | null;
  }> => {
    state = "replaying";

    let lastReplayedEventBlockNumber: null | number = null;
    try {
      const loggedEvents = createEventLogIterator();

      for await (const event of loggedEvents) {
        logger.debug(`replaying event at block number ${event.blockNumber}`);
        await onEvent(event, onContractRequested);
        lastReplayedEventBlockNumber = event.blockNumber;
      }
    } catch (err) {
      console.log(err);
    }
    return { lastReplayedEventBlockNumber };
  };

  async function* createEventLogIterator() {
    const eventLogReadStream = createReadStream(eventLogPath);

    const rl = readline.createInterface({
      input: eventLogReadStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      yield JSON.parse(line, withBigNumberJSONParsing) as ChainsauceEvent;
    }
  }

  return { start, stop };
};

/**
 *  Chainsauce events have args as arrays with named properties, e.g.
 *
 *    ["foo", "bar", prop1: "foo", prop2: "bar"]
 *
 *  That throws off JSON serialization, so we convert that to a proper object, e.g.:
 *
 *    { prop1: "foo", prop2: "bar" }
 *
 *  XXX This should be fixed in chainsauce.
 */
function fixChainsauceEvent<T>(obj: T): T {
  if (Array.isArray(obj)) {
    if (Object.keys(obj).length !== obj.length) {
      const newObj: { [prop: string]: any } = {};
      // eslint-disable-next-line @typescript-eslint/no-for-in-array
      for (const name in obj) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        newObj[name] = fixChainsauceEvent(obj[name]);
      }
      return newObj as T;
    } else {
      // @ts-expect-error
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return obj.map(fixChainsauceEvent);
    }
  } else if (typeof obj === "object" && obj !== null) {
    const newObj: { [prop: string]: any } = {};
    for (const name in obj) {
      newObj[name] = fixChainsauceEvent(obj[name]);
    }
    return newObj as T;
  } else {
    return obj;
  }
}

const withBigNumberJSONParsing = (_key: string, value: any): any => {
  if (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    value.type === "BigNumber"
  ) {
    return BigNumber.from(value);
  } else {
    return value;
  }
};
