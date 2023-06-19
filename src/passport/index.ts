import { wait } from "../utils/index.js";

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

type PassportScoresResponse = {
  count: number;
  passports: PassportScore[];
};

/**
 * Fetches list of contributors who have score above the threshold
 * as reported by the ThresholdScoreCheck from passport scorer
 *
 * @returns string[]
 */
export const getPassportScores = async () => {
  if (!process.env.PASSPORT_SCORER_ID) {
    throw new Error("PASSPORT_SCORER_ID is not set");
  }

  const scorerId = Number(process.env.PASSPORT_SCORER_ID);

  const limit = 1000;
  let offset = 0;

  const { passports, count } = await fetchPassportScores(
    scorerId,
    limit,
    offset
  );

  const allPassports: PassportScore[] = passports;

  const paginationCount = count / limit;

  for (let i = 0; i < paginationCount; i++) {
    // increase offset
    offset += limit;

    console.log("Fetching", offset, "/", count, "passports...");

    // fetch next set of passports
    const { passports } = await fetchPassportScores(scorerId, limit, offset);

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
  passports: PassportScore[]
): PassportScore[] => {
  return passports.filter(
    (passport) => passport.evidence && passport.evidence.success
  );
};

/**
 * Fetches passport scores of a given community based on limit and offset
 *
 * @param scorerId number
 * @param limit number
 * @param offset number
 * @param maxAttempts
 * @returns Promise<PassportScoresResponse>
 */
export const fetchPassportScores = async (
  scorerId: number,
  limit: number,
  offset: number,
  maxAttempts = 5
): Promise<PassportScoresResponse> => {
  const passportURL = `https://api.scorer.gitcoin.co/registry/score/${scorerId}?limit=${limit}&offset=${offset}`;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(passportURL, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PASSPORT_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonResponse = (await response.json()) as any;

      const count: number = jsonResponse.count;
      const passports: PassportScore[] = jsonResponse.items;

      return {
        passports,
        count,
      };
    } catch (e) {
      attempt = attempt + 1;
      await wait(attempt * 5000);
      console.log("[Passport] Retrying, attempt:", attempt, e);
    }
  }

  throw new Error("Failed to load passport scores");
};
