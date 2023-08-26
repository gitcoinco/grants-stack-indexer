/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { Logger } from "pino";
import { tmpNameSync } from "tmp";
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";
import {
  createPassportProvider,
  PassportProvider,
  PassportProviderConfig,
} from "./index.js";
import { SAMPLE_PASSPORT_DATA } from "./index.test.fixtures.js";

describe("passport provider", () => {
  let passportProvider: PassportProvider;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  const getTestConfig = (): PassportProviderConfig => ({
    apiKey: "dummy-key",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as unknown as Logger,
    scorerId: "123",
    delayBetweenFullUpdatesMs: 10,
    dbPath: tmpNameSync(), // TODO: do in memory or cleanup in afterEach
  });

  describe("lifecycle", () => {
    passportProvider = createPassportProvider(getTestConfig());

    test("throws if reading is attempted before starting", async () => {
      await expect(() =>
        passportProvider.getScoreByAddress("voter-1")
      ).rejects.toMatchInlineSnapshot("[Error: Service not started]");
    });

    test("throws if stopping is attempted before starting", () => {
      expect(() => passportProvider.stop()).toThrowErrorMatchingInlineSnapshot(
        '"Service not started"'
      );
    });
  });

  describe("updating", () => {
    test("fetches data from passport API upon startup if stored dataset is empty", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ count: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        });

      passportProvider = createPassportProvider({
        ...getTestConfig(),
        fetch: fetchMock,
      });

      const starting = passportProvider.start();
      await vi.advanceTimersToNextTimerAsync();
      await starting;

      expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
        ]
      `);
    });

    test("recovers upon HTTP errors from the passport API", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ count: 3 }),
        })
        .mockResolvedValueOnce({
          ok: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        });

      passportProvider = createPassportProvider({
        ...getTestConfig(),
        fetch: fetchMock,
      });

      const starting = passportProvider.start();
      await vi.advanceTimersToNextTimerAsync();
      await expect(starting).resolves.not.toThrow();

      expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
        ]
      `);
    });

    test("polls passport API for updates", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ count: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ count: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        });

      passportProvider = createPassportProvider({
        ...getTestConfig(),
        fetch: fetchMock,
      });

      const starting = passportProvider.start();
      await vi.advanceTimersToNextTimerAsync();
      await starting;

      expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
        ]
      `);

      await vi.advanceTimersToNextTimerAsync();

      expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
        ]
      `);
    });

    test("recovers from content errors from the passport API", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ count: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(JSON.parse("<!DOCTYPE html><h1>Error</h1>")),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        });

      passportProvider = createPassportProvider({
        ...getTestConfig(),
        fetch: fetchMock,
      });

      const starting = passportProvider.start();
      await vi.advanceTimersToNextTimerAsync();
      await expect(starting).resolves.not.toThrow();

      expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
        ]
      `);
    });

    test("when remote dataset contains more than 1000 items, they are downloaded in batches", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ count: 1500 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
        });

      passportProvider = createPassportProvider({
        ...getTestConfig(),
        fetch: fetchMock,
      });

      const starting = passportProvider.start();
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      await starting;

      expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "https://api.scorer.gitcoin.co/registry/score/123?limit=1",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=0&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
          [
            "https://api.scorer.gitcoin.co/registry/score/123?offset=1000&limit=1000",
            {
              "headers": {
                "authorization": "Bearer dummy-key",
              },
              "retry": {
                "maxTimeout": 5000,
                "randomize": true,
                "retries": 5,
              },
            },
          ],
        ]
      `);
    });

    afterEach(() => {
      passportProvider.stop();
    });
  });

  describe("querying", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 3 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(SAMPLE_PASSPORT_DATA),
      });

    beforeEach(async () => {
      passportProvider = createPassportProvider({
        ...getTestConfig(),
        fetch: fetchMock,
      });
      const starting = passportProvider.start();
      await vi.advanceTimersToNextTimerAsync();
      await starting;
    });

    afterEach(() => {
      passportProvider.stop();
    });

    test.only("provides score for address, if available", async () => {
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
      const score = await passportProvider.getScoreByAddress(
        "non-existing-address"
      );

      expect(score).toEqual(undefined);
    });
  });
});
