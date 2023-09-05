import {
  RetryProvider,
  JsonStorage,
  Indexer,
  Event as ChainsauceEvent,
  ToBlock,
} from "chainsauce";
import { Logger } from "pino";
import { createReadStream, createWriteStream } from "node:fs";
import { access, constants } from "node:fs/promises";
import readline from "node:readline";
import { ethers } from "ethers";
import { Chain } from "../config.js";
import { BigNumber } from "ethers";
import { throttle } from "throttle-debounce";

interface BlockchainListener {
  start: (params: { waitForCatchup: boolean }) => Promise<void>;
  stop: () => void;
}

export const createBlockchainListener = ({
  logger,
  onEvent,
  eventLogPath,
  rpcProvider,
  db,
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
  eventLogPath: string | null;
  rpcProvider: RetryProvider;
  db: JsonStorage;
  toBlock: ToBlock;
  chain: Chain;
}): BlockchainListener => {
  const POLL_INTERVAL_MS = 2000;
  const MINIMUM_BLOCKS_LEFT_BEFORE_CONSIDERING_CAUGHT_UP = 500;

  let state: "starting" | "replaying" | "listening" | "stopped" = "starting";
  let pollTimeoutId: NodeJS.Timeout;
  let indexer: Indexer<JsonStorage> | null = null;

  // Store subscriptions requested during replay and activate them all when replay is done
  const delayedSubscriptions: Array<{
    address: string;
    abi: ethers.ContractInterface;
  }> = [];

  const eventLogStream = eventLogPath
    ? createWriteStream(eventLogPath, { flags: "a" })
    : null;

  const start = async () => {
    logger.info("replaying logged events...");
    const { lastReplayedEventBlockNumber } = await replayLoggedEvents();

    if (lastReplayedEventBlockNumber === null) {
      logger.info("no logged events found");
    } else {
      logger.info(
        `replayed events up to block ${lastReplayedEventBlockNumber}`
      );
    }

    const subscriptions = await db.getSubscriptions();
    const network = await rpcProvider.getNetwork();

    const throttledLogProgress = throttle(
      5000,
      (currentBlock: number, lastBlock: number) => {
        logger.debug(
          `indexed to block ${currentBlock}; last block on chain: ${lastBlock}`
        );
      }
    );

    await new Promise<void>((resolve) => {
      let isCaughtUp: boolean = false;
      indexer = new Indexer(
        rpcProvider,
        network,
        // Eslint complains that an argument of type Subscription[] cannot be
        // assigned to a parameter of type Subscription[]. Why?
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        subscriptions,
        db,
        (_indexer: Indexer<JsonStorage>, chainsauceEvent: ChainsauceEvent) => {
          const event = fixChainsauceEvent(chainsauceEvent);
          logger.trace(
            `handling live event (block number ${event.blockNumber})`
          );
          eventLogStream?.write(JSON.stringify(event) + "\n");
          return onEvent(event, onContractRequested);
        },
        {
          requireExplicitStart: true,
          toBlock,
          logger: logger.child({ subsystem: "DataUpdater" }),
          eventCacheDirectory: null,
          onProgress: ({ currentBlock, lastBlock }) => {
            throttledLogProgress(currentBlock, lastBlock);
            if (
              !isCaughtUp &&
              lastBlock - currentBlock <
                MINIMUM_BLOCKS_LEFT_BEFORE_CONSIDERING_CAUGHT_UP
            ) {
              logger.info("caught up with blockchain events");
              isCaughtUp = true;
              resolve();
            }
          },
        }
      );

      void listenToLiveEvents({
        lastExaminedBlockNumber:
          lastReplayedEventBlockNumber === null
            ? -1
            : lastReplayedEventBlockNumber + 1,
      });
    });
  };

  const stop = () => {
    clearTimeout(pollTimeoutId);
  };

  const listenToLiveEvents = ({
    lastExaminedBlockNumber,
  }: {
    lastExaminedBlockNumber: number;
  }) => {
    state = "listening";
    if (indexer === null) {
      throw new Error("chainsauce indexer not initialized");
    }

    for (const subscription of chain.subscriptions) {
      indexer.subscribe(
        subscription.address,
        subscription.abi,
        Math.max(lastExaminedBlockNumber + 1, subscription.fromBlock ?? 0)
      );
    }

    for (const subscription of delayedSubscriptions) {
      indexer.subscribe(
        subscription.address,
        subscription.abi,
        lastExaminedBlockNumber + 1
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
    if (eventLogPath === null) {
      return { lastReplayedEventBlockNumber: null };
    }

    try {
      await access(eventLogPath, constants.F_OK);
    } catch (err) {
      logger.info({
        msg: `event log not found; this is probably because none was generated yet`,
        err,
      });
      return { lastReplayedEventBlockNumber: null };
    }

    state = "replaying";

    const throttledLogProgress = throttle(5000, (blockNumber: number) => {
      logger.debug(`replayed events up to ${blockNumber}`);
    });

    let lastReplayedEventBlockNumber: null | number = null;
    try {
      const loggedEvents = createEventLogIterator();

      for await (const event of loggedEvents) {
        await onEvent(event, onContractRequested);
        throttledLogProgress(event.blockNumber);
        lastReplayedEventBlockNumber = event.blockNumber;
      }
    } catch (err) {
      logger.error({ msg: `error while replaying events`, err });
    }
    return { lastReplayedEventBlockNumber };
  };

  async function* createEventLogIterator() {
    if (eventLogPath === null) {
      // Should never happen as we're guarding against it in outer scope
      throw new Error("event log path not set");
    }
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
