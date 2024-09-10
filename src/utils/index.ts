// TODO: why is eslint not recognizing type narrowing?
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Logger } from "pino";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
export function encodeJsonWithBigInts(value: unknown): string {
  return JSON.stringify(value, (_key, value) => {
    if (typeof value === "bigint") {
      return { type: "bigint", value: value.toString() };
    }
    return value as unknown;
  });
}

export function decodeJsonWithBigInts<T>(encodedJson: string): T {
  return JSON.parse(encodedJson, (_key, value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === "bigint" &&
      "value" in value &&
      typeof value.value === "string"
    ) {
      return BigInt(value.value);
    }
    return value as unknown;
  }) as T;
}

export const UINT64_MAX = 18446744073709551615n;

export const getDateFromTimestamp = (timestamp: bigint): Date | null => {
  return timestamp < UINT64_MAX ? new Date(Number(timestamp) * 1000) : null;
};

export const getExternalIP = async (logger: Logger): Promise<string> => {
  const urls = ["https://api.ipify.org?format=json", "http://ipinfo.io/json"];
  for (const url of urls) {
    try {
      logger.debug(`Attempting to fetch IP address from: ${url}`);
      const response = await fetch(url);
      if (response.ok) {
        const { ip } = (await response.json()) as { ip: string };
        logger.info(`Successfully fetched IP address: ${ip}`);
        return ip;
      }
      throw new Error(`Request failed with status: ${response.status}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to fetch from ${url}: ${error.message}`);
      } else {
        logger.error(`Failed to fetch from ${url}`);
      }
    }
  }
  throw new Error(
    "Unable to fetch external IP address from both primary and fallback URLs."
  );
};
