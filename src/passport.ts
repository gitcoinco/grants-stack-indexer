import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import { parseArgs } from "node:util";

import config from "./config.js";

type PassportEvidence = {
  type: string;
  rawScore: string;
  threshold: string;
  success: boolean;
};

export type PassportResponse = {
  address: string;
  score?: string;
  status?: string;
  last_score_timestamp?: string;
  evidence?: PassportEvidence;
  error?: string | null;
  detail?: string;
};

type PassportScoresResponse = {
  count: number;
  passports: PassportResponse[];
};

/**
 * Fetches list of contributors who have score above the threshold
 * as reported by the ThresholdScoreCheck from passport scorer
 *
 * @returns string[]
 */
export const getPassportScores = async () => {
  const communityId = 13;
  const limit = 1000;
  let offset = 0;

  const { passports, count } = await fetchPassportScores(
    communityId,
    limit,
    offset
  );

  console.log("Fetching", count, "passports...");

  const allPassports: PassportResponse[] = passports;

  const paginationCount = count / limit;

  for (let i = 0; i < paginationCount; i++) {
    // increase offset
    offset += limit;

    // fetch next set of passports
    const { passports } = await fetchPassportScores(communityId, limit, offset);

    allPassports.push(...passports);
  }

  return allPassports;
};

/**
 * Filters passports having evidence.success as true
 *
 * @param passports PassportResponse[]
 * @returns PassportResponse[]
 */
export const filterPassportByEvidence = (
  passports: PassportResponse[]
): PassportResponse[] => {
  return passports.filter(
    (passport) => passport.evidence && passport.evidence.success
  );
};

/**
 * Fetches passport scores of a given community based on limit and offset
 *
 * @param communityId number
 * @param limit number
 * @param offset number
 * @returns Promise<PassportScoresResponse>
 */
export const fetchPassportScores = async (
  communityId: number,
  limit: number,
  offset: number
): Promise<PassportScoresResponse> => {
  const passportURL = `https://api.scorer.gitcoin.co/registry/score/${communityId}?limit=${limit}&offset=${offset}`;

  const response = await fetch(passportURL, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PASSPORT_API_KEY}`,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonResponse = (await response.json()) as any;

  const count: number = jsonResponse.count;
  const passports: PassportResponse[] = jsonResponse.items;

  return {
    passports,
    count,
  };
};

async function getScoresAndWrite(dir: string) {
  const scores = await getPassportScores();

  const validAddresses = filterPassportByEvidence(scores).map((passport) => {
    return ethers.utils.getAddress(passport.address);
  });

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "passport_scores.json"),
    JSON.stringify(scores)
  );
  await fs.writeFile(
    path.join(dir, "passport_valid_addresses.json"),
    JSON.stringify(validAddresses)
  );
}

const { values } = parseArgs({
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
  },
});

async function loop() {
  await getScoresAndWrite(config.storageDir);

  setTimeout(loop, 60 * 60 * 1000);
}

if (values.follow) {
  await loop();
} else {
  await getScoresAndWrite(config.storageDir);
}
