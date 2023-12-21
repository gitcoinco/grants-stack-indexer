/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import intoStream from "into-stream";
import { FetchInterface } from "make-fetch-happen";
import { describe, expect, afterEach, beforeAll, vi, Mocked } from "vitest";
import { createPassportProvider, PassportProvider } from "./index.js";
import { test } from "./index.test.fixtures.js";

describe("lifecycle", () => {
  test("throws if reading is attempted before starting", async ({
    logger,
    dbPath,
  }) => {
    const passportProvider = createPassportProvider({
      logger,
      dbPath,
      scorerId: 13,
    });

    await expect(() =>
      passportProvider.getScoreByAddress("voter-1")
    ).rejects.toMatchInlineSnapshot("[Error: Service not started]");
  });

  test("throws if stopping is attempted before starting", ({
    logger,
    dbPath,
  }) => {
    const passportProvider = createPassportProvider({
      logger,
      dbPath,
      scorerId: 13,
    });

    expect(() => passportProvider.stop()).toThrowErrorMatchingInlineSnapshot(
      '"Service not started"'
    );
  });
});

describe("operation", () => {
  let passportProvider: PassportProvider;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    passportProvider.stop();
  });

  describe("updating", () => {
    test("fetches data from passport public dump upon startup", async ({
      logger,
      dbPath,
      passportData,
    }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: intoStream(passportData),
      }) as unknown as FetchInterface;

      passportProvider = createPassportProvider({
        scorerId: 13,
        logger,
        dbPath,
        fetch: fetchMock,
      });

      await passportProvider.start();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://public.scorer.gitcoin.co/passport_scores/registry_score.jsonl"
      );
    });

    test.todo("handles a missing passport dump");

    test("polls passport dump for updates", async ({
      logger,
      dbPath,
      passportData,
    }) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: intoStream(passportData),
      });

      passportProvider = createPassportProvider({
        logger,
        dbPath,
        scorerId: 13,
        fetch: fetchMock as unknown as Mocked<FetchInterface>,
      });

      await passportProvider.start();

      fetchMock.mockClear();

      await vi.advanceTimersToNextTimerAsync();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://public.scorer.gitcoin.co/passport_scores/registry_score.jsonl"
      );

      fetchMock.mockClear();

      await vi.advanceTimersToNextTimerAsync();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://public.scorer.gitcoin.co/passport_scores/registry_score.jsonl"
      );
    });
  });

  describe("querying", () => {
    test("provides score for address, if available", async ({
      logger,
      dbPath,
      passportData,
    }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: intoStream(passportData),
      }) as unknown as FetchInterface;

      passportProvider = createPassportProvider({
        logger,
        dbPath,
        scorerId: 13,
        fetch: fetchMock,
      });
      await passportProvider.start();

      const score = await passportProvider.getScoreByAddress(
        "0x7587cfbd20e5a970209526b4d1f69dbaae8bed37"
      );

      expect(score).toMatchInlineSnapshot(`
        {
          "address": "0x7587cfbd20e5a970209526b4d1f69dbaae8bed37",
          "error": null,
          "evidence": {
            "rawScore": "30.645",
            "success": true,
            "threshold": "20.00000",
            "type": "ThresholdScoreCheck",
          },
          "id": 36,
          "last_score_timestamp": "2023-07-25T20:03:39.244Z",
          "score": "1.000000000",
          "status": "DONE",
        }
      `);
    });

    test("returns undefined when score is not available", async ({
      passportData,
      dbPath,
      logger,
    }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: intoStream(passportData),
      }) as unknown as FetchInterface;

      passportProvider = createPassportProvider({
        logger,
        dbPath,
        scorerId: 13,
        fetch: fetchMock,
      });
      await passportProvider.start();

      const score = await passportProvider.getScoreByAddress(
        "non-existing-address"
      );

      expect(score).toEqual(undefined);
    });

    test("provides scores for multiple addresses, if available, handling repeated addresses", async ({
      logger,
      dbPath,
      passportData,
    }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: intoStream(passportData),
      }) as unknown as FetchInterface;

      passportProvider = createPassportProvider({
        logger,
        dbPath,
        scorerId: 13,
        fetch: fetchMock,
      });
      await passportProvider.start();

      const score = await passportProvider.getScoresByAddresses([
        "0x7587cfbd20e5a970209526b4d1f69dbaae8bed37",
        "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
        "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
        "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
        "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
        "0x455f491985c2f18b2c77d181f009ee6bdc41b1f8",
        "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea",
      ]);

      expect(score).toMatchInlineSnapshot(`
        Map {
          "0x7587cfbd20e5a970209526b4d1f69dbaae8bed37" => {
            "address": "0x7587cfbd20e5a970209526b4d1f69dbaae8bed37",
            "error": null,
            "evidence": {
              "rawScore": "30.645",
              "success": true,
              "threshold": "20.00000",
              "type": "ThresholdScoreCheck",
            },
            "id": 36,
            "last_score_timestamp": "2023-07-25T20:03:39.244Z",
            "score": "1.000000000",
            "status": "DONE",
          },
          "0x7bec70fa7ef926878858333b0fa581418e2ef0b5" => {
            "address": "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
            "error": null,
            "evidence": {
              "rawScore": "22.748",
              "success": true,
              "threshold": "20.00000",
              "type": "ThresholdScoreCheck",
            },
            "id": 37,
            "last_score_timestamp": "2023-07-25T20:03:38.747Z",
            "score": "1.000000000",
            "status": "DONE",
          },
          "0x455f491985c2f18b2c77d181f009ee6bdc41b1f8" => {
            "address": "0x455f491985c2f18b2c77d181f009ee6bdc41b1f8",
            "error": null,
            "evidence": {
              "rawScore": "0",
              "success": false,
              "threshold": "20.00000",
              "type": "ThresholdScoreCheck",
            },
            "id": 28,
            "last_score_timestamp": "2023-07-25T20:03:37.475Z",
            "score": "0E-9",
            "status": "DONE",
          },
          "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea" => {
            "address": "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea",
            "error": null,
            "evidence": {
              "rawScore": "22.917",
              "success": true,
              "threshold": "20.00000",
              "type": "ThresholdScoreCheck",
            },
            "id": 29,
            "last_score_timestamp": "2023-07-25T20:03:39.170Z",
            "score": "1.000000000",
            "status": "DONE",
          },
        }
      `);
    });

    test("when retrieving scores for multiple addresses, return undefined for addresses whose score is not known", async ({
      passportData,
      dbPath,
      logger,
    }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: intoStream(passportData),
      }) as unknown as FetchInterface;

      passportProvider = createPassportProvider({
        logger,
        dbPath,
        scorerId: 13,
        fetch: fetchMock,
      });
      await passportProvider.start();

      const score = await passportProvider.getScoresByAddresses([
        "non-existing-address",
        "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea",
        "non-existing-address-2",
        "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
        "non-existing-address-3",
      ]);

      expect(score).toMatchInlineSnapshot(`
        Map {
          "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea" => {
            "address": "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea",
            "error": null,
            "evidence": {
              "rawScore": "22.917",
              "success": true,
              "threshold": "20.00000",
              "type": "ThresholdScoreCheck",
            },
            "id": 29,
            "last_score_timestamp": "2023-07-25T20:03:39.170Z",
            "score": "1.000000000",
            "status": "DONE",
          },
          "0x7bec70fa7ef926878858333b0fa581418e2ef0b5" => {
            "address": "0x7bec70fa7ef926878858333b0fa581418e2ef0b5",
            "error": null,
            "evidence": {
              "rawScore": "22.748",
              "success": true,
              "threshold": "20.00000",
              "type": "ThresholdScoreCheck",
            },
            "id": 37,
            "last_score_timestamp": "2023-07-25T20:03:38.747Z",
            "score": "1.000000000",
            "status": "DONE",
          },
        }
      `);
    });
  });
});
