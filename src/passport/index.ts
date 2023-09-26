/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import split2 from "split2";
import { Level } from "level";
import enhancedFetch from "make-fetch-happen";
import { access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Logger } from "pino";

const DEFAULT_DELAY_BETWEEN_FULL_UPDATES_MS = 1000 * 60 * 30;

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
  scorerId: number;
  logger: Logger;
  dbPath: string;
  deprecatedJSONPassportDumpPath?: string;
  fetch?: typeof enhancedFetch;
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

  const { logger } = config;
  const fetch = config.fetch ?? enhancedFetch;
  const delayBetweenFullUpdatesMs =
    config.delayBetweenFullUpdatesMs ?? DEFAULT_DELAY_BETWEEN_FULL_UPDATES_MS;

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

    setTimeout(poll, DEFAULT_DELAY_BETWEEN_FULL_UPDATES_MS);
  };

  const runFullUpdate = async (): Promise<void> => {
    if (state.type !== "ready" && state.type !== "starting") {
      // Service might have been stopped while the data set was being fetched.
      return;
    }

    logger.debug("updating passports...");

    const { db } = state;
    const res = await fetch(
      "https://public.scorer.gitcoin.co/passport_scores/registry_score.jsonl"
    );
    const { body } = res;

    if (body === null) {
      throw new Error("Passport dump is empty");
    }

    await new Promise<void>((resolve) => {
      body
        .pipe(split2())
        .on("data", (line: string) => {
          const {
            passport: { address, community },
            ...rest
          } = JSON.parse(line);

          if (community === config.scorerId) {
            // TODO use a queue to ensure sequential application
            db.put(address.toLowerCase(), { address, ...rest });
          }
        })
        .on("end", () => {
          resolve();
        })
        .on("error", () => {
          throw new Error("not handled");
        });
    });

    if (config.deprecatedJSONPassportDumpPath !== undefined) {
      await writeDeprecatedCompatibilityJSONDump(
        db,
        config.deprecatedJSONPassportDumpPath
      );
    }
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
