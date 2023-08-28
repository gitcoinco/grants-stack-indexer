/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Level } from "level";
import enhancedFetch from "make-fetch-happen";
import { access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Logger } from "pino";

const PASSPORT_API_MAX_ITEMS_LIMIT = 1000;
const DELAY_BETWEEN_FULL_UPDATES_MS = 60 * 1000;

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
  dbPath: string;
  deprecatedJSONPassportDumpPath?: string;
  fetch?: typeof global.fetch;
  delayBetweenFullUpdatesMs?: number;
}

type PassportProviderState =
  | { type: "empty" }
  | {
      type: "starting";
      pollTimeoutId: null;
      db: Level<string, PassportScore>;
    }
  | {
      type: "ready";
      pollTimeoutId: NodeJS.Timeout | null;
      db: Level<string, PassportScore>;
    }
  | {
      type: "stopped";
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

    logger.info({
      msg: `${state.type} => starting`,
      config: {
        scorerId: config.scorerId,
        dbPath: config.dbPath,
        delayBetweenFullUpdatesMs: config.delayBetweenFullUpdatesMs,
      },
    });

    try {
      await access(config.dbPath);

      logger.info("local passport dataset found");

      state = {
        type: "starting",
        pollTimeoutId: null,
        db: new Level<string, PassportScore>(config.dbPath, {
          valueEncoding: "json",
        }),
      };

      if (config.deprecatedJSONPassportDumpPath !== undefined) {
        await writeDeprecatedCompatibilityJSONDump(
          state.db,
          config.deprecatedJSONPassportDumpPath
        );
      }
    } catch (err) {
      logger.info(
        "no passports dataset found locally, fetching remote dataset before starting"
      );

      state = {
        type: "starting",
        pollTimeoutId: null,
        db: new Level<string, PassportScore>(config.dbPath, {
          valueEncoding: "json",
        }),
      };

      await runFullUpdate();
    }

    logger.info(`${state.type} => ready`);
    state = { ...state, type: "ready" };
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
    state = { type: "stopped", pollTimeoutId: null };
  };

  const getScoreByAddress: PassportProvider["getScoreByAddress"] = async (
    address: string
  ): Promise<PassportScore | undefined> => {
    if (state.type !== "ready") {
      throw new Error("Service not started");
    }
    const { db } = state;

    try {
      return await db.get(address);
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "LEVEL_NOT_FOUND"
      ) {
        return undefined;
      } else {
        throw err;
      }
    }
  };

  // INTERNALS

  const poll = async (): Promise<void> => {
    if (state.type !== "ready") {
      throw new Error("Service not started");
    }

    await runFullUpdate();

    setTimeout(poll, DELAY_BETWEEN_FULL_UPDATES_MS);
  };

  const runFullUpdate = async (): Promise<void> => {
    if (state.type !== "ready" && state.type !== "starting") {
      // Service might have been stopped while the data set was being fetched.
      return;
    }

    logger.debug("updating passports...");
    const remotePassportCount = await fetchRemotePassportCount();
    const { db } = state;

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

      // @ts-ignore types from make-fetch-happen are conflicting with types from global fetch in CI
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

        await db.batch(
          passportBatch.map((score) => ({
            type: "put",
            key: score.address.toLowerCase(),
            value: score,
          }))
        );

        offset += PASSPORT_API_MAX_ITEMS_LIMIT;
      } catch (err) {
        logger.error({ msg: `Error reading response from Passport API`, err });
        continue;
      }
    }

    if (config.deprecatedJSONPassportDumpPath !== undefined) {
      writeDeprecatedCompatibilityJSONDump(
        state.db,
        config.deprecatedJSONPassportDumpPath
      );
    }
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

  const writeDeprecatedCompatibilityJSONDump = async (
    db: Level<string, PassportScore>,
    path: string
  ): Promise<void> => {
    logger.info("writing passport JSON dump for backward compatibility");

    const deprecatedCompatibilityDumpStream = createWriteStream(path);
    deprecatedCompatibilityDumpStream.write("[\n");
    let isFirst = true;
    for await (const passportScore of db.values()) {
      if (isFirst) {
        isFirst = false;
      } else {
        deprecatedCompatibilityDumpStream.write(",\n");
      }

      deprecatedCompatibilityDumpStream.write(JSON.stringify(passportScore));
    }
    deprecatedCompatibilityDumpStream.write("\n]");
    deprecatedCompatibilityDumpStream.end();

    logger.info(`passport JSON dump written`);
  };

  // EXPORTS

  return { start, stop, getScoreByAddress };
};
