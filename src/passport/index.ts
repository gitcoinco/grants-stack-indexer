/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import sleep from "sleep-promise";
import enhancedFetch from "make-fetch-happen";
import { Logger } from "pino";

const PASSPORT_API_MAX_ITEMS_LIMIT = 1000;
const DELAY_BETWEEN_FULL_UPDATES_MS = 60 * 1000;
const DELAY_BETWEEN_PAGE_REQUESTS_MS = 60 * 50;

export type PassportScore = {
  address: string;
  score: string | null;
  status: string;
  last_score_timestamp: string;
  evidence: {
    type: string;
    success: boolean;
    rawScore: string;
    threshold: string;
  } | null;
  error?: string | null;
  detail?: string;
};

export interface PassportProviderConfig {
  apiKey: string;
  scorerId: string;
  logger: Logger;
  persist: (passports: PassportScore[]) => Promise<void>;
  load: () => Promise<PassportScore[] | null>;
  fetch?: typeof global.fetch;
  delayBetweenPageRequestsMs?: number;
  delayBetweenFullUpdatesMs?: number;
}

type PassportProviderState =
  | { type: "empty" }
  | {
      type: "starting";
      scoresByAddressMap: null;
      pollTimeoutId: null;
    }
  | {
      type: "ready";
      scoresByAddressMap: { [address: string]: PassportScore };
      pollTimeoutId: NodeJS.Timeout | null;
    }
  | {
      type: "stopped";
      scoresByAddressMap: null;
      pollTimeoutId: null;
    };

export interface PassportProvider {
  start: (opts?: { watch: boolean }) => Promise<void>;
  stop: () => void;
  getScoreByAddress: (address: string) => Promise<PassportScore | undefined>;
}

export const createPassportProvider = (
  config: PassportProviderConfig
): PassportProvider => {
  // CONFIG

  const baseRequestUri = `https://api.scorer.gitcoin.co/registry/score/${config.scorerId}`;
  const { logger } = config;
  const fetch = config.fetch ?? enhancedFetch;
  const delayBetweenPageRequestsMs =
    config.delayBetweenPageRequestsMs ?? DELAY_BETWEEN_PAGE_REQUESTS_MS;
  const delayBetweenFullUpdatesMs =
    config.delayBetweenFullUpdatesMs ?? DELAY_BETWEEN_FULL_UPDATES_MS;

  // STATE

  let state: PassportProviderState = {
    type: "empty",
  };

  // API

  const start: PassportProvider["start"] = async (opts = { watch: true }) => {
    if (state.type !== "empty") {
      throw new Error(`Service not in empty state (${state.type})`);
    }

    logger.info(`${state.type} => starting`);
    state = { type: "starting", scoresByAddressMap: null, pollTimeoutId: null };

    logger.debug("loading locally persisted passports...");

    let initialPassportDataset: PassportScore[] | null = await config.load();
    if (initialPassportDataset === null) {
      logger.info(
        "no passports dataset found locally, fetching remote dataset before starting"
      );
      initialPassportDataset = await fetchEntireDataset();
    }

    logger.debug(`loaded ${initialPassportDataset.length} passports`);

    const scoresByAddressMap = computeScoresByAddressMap(
      initialPassportDataset
    );

    logger.info(`${state.type} => ready`);
    state = { ...state, type: "ready", scoresByAddressMap };
    if (opts.watch) {
      state.pollTimeoutId = setTimeout(poll, delayBetweenFullUpdatesMs);
    }
  };

  const stop: PassportProvider["stop"] = () => {
    if (state.type !== "ready") {
      throw new Error("Service not started");
    }

    if (state.pollTimeoutId !== null) {
      clearTimeout(state.pollTimeoutId);
    }

    logger.info(`${state.type} => stopped`);
    state = { type: "stopped", scoresByAddressMap: null, pollTimeoutId: null };
  };

  const getScoreByAddress: PassportProvider["getScoreByAddress"] = async (
    address: string
  ): Promise<PassportScore | undefined> => {
    if (state.type !== "ready") {
      throw new Error("Service not started");
    }

    // Async not really necessary right now because data is in memory, but this
    // could easily be imply I/O in the future, so might as well make it async
    // already
    return Promise.resolve(state.scoresByAddressMap[address]);
  };

  // INTERNALS

  const computeScoresByAddressMap = (
    passportScores: PassportScore[]
  ): Record<string, PassportScore> => {
    const scoresByAddressMap: Record<string, PassportScore> = {};
    for (const score of passportScores) {
      scoresByAddressMap[score.address.toLocaleLowerCase()] = score;
    }
    return scoresByAddressMap;
  };

  const poll = async (): Promise<void> => {
    if (state.type !== "ready") {
      throw new Error("Service not started");
    }

    const passportScores = await fetchEntireDataset();

    update(passportScores);

    setTimeout(poll, DELAY_BETWEEN_FULL_UPDATES_MS);
  };

  const update = (passportScores: PassportScore[]): void => {
    if (state.type !== "ready") {
      // Service might have been stopped while the data set was being fetched.
      return;
    }

    for (const score of passportScores) {
      state.scoresByAddressMap[score.address.toLocaleLowerCase()] = score;
    }
  };

  const _TODO_fetchIncrementalUpdates = async (): Promise<PassportScore[]> => {
    // https://github.com/gitcoinco/allo-indexer/issues/191
    return Promise.resolve([]);
  };

  const fetchEntireDataset = async (): Promise<PassportScore[]> => {
    // Strictly speaking, this should be aborted if stop() is called. However,
    // Passport v2 API is on the horizon, and it will change the general shape
    // of the update process, so we're just ignoring the edge case.

    logger.debug("updating passports...");
    const remotePassportCount = await fetchRemotePassportCount();
    const passports: PassportScore[] = [];

    let offset = 0;
    while (offset < remotePassportCount) {
      const requestUri = `${baseRequestUri}?offset=${offset}&limit=${PASSPORT_API_MAX_ITEMS_LIMIT}`;

      if (offset % 20000 === 0) {
        // Only log every 10000 scores to reduce log noise
        logger.debug({
          msg: `fetching from ${offset} up to ${remotePassportCount} in batches of ${PASSPORT_API_MAX_ITEMS_LIMIT}`,
          requestUri,
        });
      }

      const res = await fetch(requestUri, {
        headers: { authorization: `Bearer ${config.apiKey}` },
        retry: {
          retries: 5,
          randomize: true,
          maxTimeout: 5000,
        },
      });

      if (!res.ok) {
        // continuing without modifying offset is effectively a retry
        logger.warn(
          `passport API responde non-success status code: ${res.status}`
        );
        continue;
      }

      try {
        const { items: passportBatch } = (await res.json()) as {
          items: PassportScore[];
        };

        passports.push(...passportBatch);

        offset += PASSPORT_API_MAX_ITEMS_LIMIT;
        await sleep(delayBetweenPageRequestsMs);
      } catch (err) {
        logger.error({ msg: `Error reading response from Passport API`, err });
        continue;
      }
    }

    logger.debug(`persisting ${passports.length} passports`);
    await config.persist(passports);

    return passports;
  };

  const fetchRemotePassportCount = async (): Promise<number> => {
    // @ts-ignore
    const res = await fetch(`${baseRequestUri}?limit=1`, {
      headers: {
        authorization: `Bearer ${config.apiKey}`,
      },
    });
    const { count } = (await res.json()) as { count: number };
    return count;
  };

  // EXPORTS

  return { start, stop, getScoreByAddress };
};
