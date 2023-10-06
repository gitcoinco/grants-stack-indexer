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
  });
});
