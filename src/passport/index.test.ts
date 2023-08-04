/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Logger } from "pino";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createPassportProvider, PassportProvider } from "./index.js";
import { SAMPLE_PASSPORT_DATA } from "./index.test.fixtures.js";

const DUMMY_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

describe("passport provider", () => {
  let passportProvider: PassportProvider;

  describe("lifecycle", () => {
    passportProvider = createPassportProvider({
      apiKey: "dummy-key",
      logger: DUMMY_LOGGER,
      scorerId: "123",
      load: async () => Promise.resolve(SAMPLE_PASSPORT_DATA),
      persist: async () => {},
    });

    test("throws if reading is attempted before starting", async () => {
      await expect(() =>
        passportProvider.getScoreByAddress("voter-1")
      ).rejects.toMatchInlineSnapshot("[Error: Service not started]");
    });

    test("throws if stopping is attempted before starting", () => {
      expect(() =>
        passportProvider.stop()
      ).toThrowErrorMatchingInlineSnapshot('"Service not started"');
    });
  });

  describe("queries", () => {
    beforeEach(async () => {
      await passportProvider.start();
    });

    afterEach(() => {
      passportProvider.stop();
    });

    test("provides score for address, if available", async () => {
      await passportProvider.start();

      const score = await passportProvider.getScoreByAddress("voter-1");

      expect(score).toMatchInlineSnapshot(`
      {
        "address": "voter-1",
        "error": null,
        "evidence": {
          "rawScore": "27.21",
          "success": true,
          "threshold": "15.00000",
          "type": "ThresholdScoreCheck",
        },
        "last_score_timestamp": "2023-05-08T10:17:52.872812+00:00",
        "score": "1.000000000",
        "status": "DONE",
      }
    `);
    });

    test("returns undefined when score is not available", async () => {
      await passportProvider.start();

      const score = await passportProvider.getScoreByAddress(
        "non-existing-address"
      );

      expect(score).toEqual(undefined);
    });
  });
});
