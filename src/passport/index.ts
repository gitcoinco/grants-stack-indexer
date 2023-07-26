/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { ethers } from "ethers";
import fetch from "make-fetch-happen";
import { Logger } from "pino";

const PASSPORT_API_MAX_ITEMS_LIMIT = 1000;
const DELAY_BETWEEN_UPDATES_MS = 60 * 1000;

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

interface PassportConfig {
  apiKey: string;
  scorerId: string;
  logger: Logger;
  persist: (data: {
    passports: PassportScore[];
    validAddresses: string[];
  }) => Promise<void>;
  load: () => Promise<PassportScore[] | null>;
}

interface PassportUpdater {
  start: (opts?: { watch: boolean }) => Promise<void>;
}

export const createPassportUpdater = (
  config: PassportConfig
): PassportUpdater => {
  // CONFIG

  const baseRequestUri = `https://api.scorer.gitcoin.co/registry/score/${config.scorerId}`;
  const { logger } = config;

  // STATE

  let passports: PassportScore[] = [];

  // API

  const start = async (opts = { watch: true }) => {
    logger.info("starting");

    logger.debug("loading locally persisted passports...");
    passports = (await config.load()) ?? [];

    if (passports.length === 0) {
      logger.debug("no passports found locally, will do initial update");
      // If nothing was read from storage, don't return until
      await updateEntireDataset();
    } else {
      logger.debug(`loaded ${passports.length} passports`);
    }

    if (opts.watch) {
      setTimeout(poll, DELAY_BETWEEN_UPDATES_MS);
    }
  };

  // INTERNALS

  const poll = async (): Promise<void> => {
    // Can be switched to incremental updates once https://github.com/gitcoinco/passport/issues/1414 is fixed
    await updateEntireDataset();
    setTimeout(poll, DELAY_BETWEEN_UPDATES_MS);
  };

  const updateEntireDataset = async (): Promise<void> => {
    passports.length = 0;
    await updateIncrementally();
  };

  const updateIncrementally = async (): Promise<void> => {
    logger.debug("updating passports...");
    const remotePassportCount = await fetchRemotePassportCount();

    const newPassportCount = remotePassportCount - passports.length;
    if (newPassportCount > 0) {
      logger.debug(
        `found ${newPassportCount} new passports remotely; fetching...`
      );

      let offset = passports.length;
      while (offset < newPassportCount) {
        const requestUri = `${baseRequestUri}?offset=${offset}&limit=${PASSPORT_API_MAX_ITEMS_LIMIT}`;

        if (offset % 20000 === 0) {
          // Only log every 10000 scores to reduce log noise
          logger.debug({
            msg: `fetching from ${offset} up to ${remotePassportCount} in batches of ${PASSPORT_API_MAX_ITEMS_LIMIT}`,
            requestUri,
          });
        }

        // @ts-ignore
        const res = await fetch(requestUri, {
          headers: { authorization: `Bearer ${config.apiKey}` },
          retry: {
            retries: 5,
            randomize: true,
            maxTimeout: 5000,
          },
        });

        const { items: passportBatch } = (await res.json()) as {
          items: PassportScore[];
        };

        passports.push(...passportBatch);

        offset += PASSPORT_API_MAX_ITEMS_LIMIT;
      }
    }

    const validAddresses = passports
      .filter((passport) => passport.evidence && passport.evidence.success)
      .map((passport) => {
        return ethers.utils.getAddress(passport.address);
      });

    logger.debug(
      `persisting ${passports.length} passports (${validAddresses.length} valid addresses)`
    );
    await config.persist({ passports, validAddresses });
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

  return { start };
};
