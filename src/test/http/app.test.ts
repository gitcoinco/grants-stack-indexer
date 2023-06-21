import { vi, describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { app } from "../../http/app.js";
import { calculatorConfig } from "../../http/api/v1/matches.js";
import {
  AugmentedResult,
  DataProvider,
  FileNotFoundError,
} from "../../calculator/index.js";

vi.mock("../../prices/index.js", () => {
  return {
    convertToUSD: vi.fn().mockReturnValue({ amount: 0 }),
  };
});

const loadFixture = (name: string, extension = "json") => {
  const p = path.resolve(__dirname, "../fixtures", `${name}.${extension}`);
  const data = fs.readFileSync(p, { encoding: "utf8", flag: "r" });
  return data;
};

type Fixtures = { [path: string]: string | undefined | unknown[] };

export class TestDataProvider implements DataProvider {
  fixtures: Fixtures;

  constructor(fixtures: Fixtures) {
    this.fixtures = fixtures;
  }

  loadFile<T>(description: string, path: string): Array<T> {
    const fixture = this.fixtures[path];
    if (fixture === undefined) {
      throw new FileNotFoundError(description);
    }

    if (typeof fixture !== "string") {
      return fixture as Array<T>;
    }

    return JSON.parse(loadFixture(fixture)) as Array<T>;
  }
}

describe("server", () => {
  describe("/matches", () => {
    describe("resources not found", () => {
      test("should render 404 if round is not present in rounds.json", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": [], // empty file so the round won't be found
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if rounds file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": undefined,
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if votes file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": undefined,
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if applications file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": undefined,
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if passport_scores file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": undefined,
        });

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.status).toEqual(404);
      });
    });

    describe("calculations", () => {
      beforeEach(async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });
      });

      test("should render calculations with ignore saturation true", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "1360",
            matchedUSD: 0,
            matchedWithoutCap: "1360",
            capOverflow: "0",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "2160",
            matchedUSD: 0,
            matchedWithoutCap: "2160",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "6480",
            matchedUSD: 0,
            matchedWithoutCap: "6480",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches?ignoreSaturation=true"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
      });
    });

    describe("calculations with round not saturated", () => {
      beforeEach(async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": [
            {
              id: "0x1234",
              token: "0x0000000000000000000000000000000000000000",
              // instead of 100 like in the previous test
              // this round has a pot of 1000,
              // so it's not saturated because the sum of matches is 250
              matchAmount: "100000",
              metadata: {},
            },
          ],
          "passport_scores.json": "passport_scores",
        });
      });

      test("should render calculations with ignore saturation false", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "3400",
            matchedUSD: 0,
            matchedWithoutCap: "3400",
            capOverflow: "0",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "5400",
            matchedUSD: 0,
            matchedWithoutCap: "5400",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "16200",
            matchedUSD: 0,
            matchedWithoutCap: "16200",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches?ignoreSaturation=false"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
        expect(resp.statusCode).toBe(200);
      });
    });

    describe("calculations with bad votes", () => {
      beforeEach(async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes-with-bad-recipient",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });
      });

      test("should keep the same results skipping bad votes", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "1360",
            matchedUSD: 0,
            matchedWithoutCap: "1360",
            capOverflow: "0",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "2160",
            matchedUSD: 0,
            matchedWithoutCap: "2160",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "6480",
            matchedUSD: 0,
            matchedWithoutCap: "6480",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/chains/1/rounds/0x1234/matches?ignoreSaturation=true"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
      });
    });

    describe("calculations with overrides", () => {
      test("should render calculations", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        const overridesContent = loadFixture("overrides", "csv");

        const resp = await request(app)
          .post("/api/v1/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");

        expect(resp.statusCode).toBe(201);

        const matches = resp.body.reduce(
          (acc: Record<string, string>, match: AugmentedResult) => {
            acc[match.projectId] = match.matched.toString();
            return acc;
          },
          {} as Record<string, string>
        );

        // all votes for projects 1 are overridden with coefficient 0
        expect(resp.body.length).toBe(3);
        expect(matches["project-id-1"]).toBe("0");
        expect(matches["project-id-2"]).toBe("2500");
        expect(matches["project-id-3"]).toBe("7500");
      });

      test("coefficients should multiply votes", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        const overridesContent = loadFixture(
          "overrides-with-floating-coefficient",
          "csv"
        );

        const resp = await request(app)
          .post("/api/v1/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");

        expect(resp.statusCode).toBe(201);

        const matches = resp.body.reduce(
          (acc: Record<string, AugmentedResult>, match: AugmentedResult) => {
            acc[match.projectId] = match;
            return acc;
          },
          {} as Record<string, AugmentedResult>
        );

        // project Id received half of the vote amounts because they have been revised as 0.5
        expect(resp.body.length).toBe(3);
        expect(matches["project-id-1"].totalReceived).toBe("750");
        expect(matches["project-id-1"].matched).toBe("710");

        expect(matches["project-id-2"].totalReceived).toBe("1000");
        expect(matches["project-id-2"].matched).toBe("2322");

        expect(matches["project-id-3"].totalReceived).toBe("3400");
        expect(matches["project-id-3"].matched).toBe("6967");
      });

      test("should render 400 if no overrides file has been uploaded", async () => {
        const resp = await request(app).post(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({ error: "overrides param required" });
      });

      test("should render 400 if the overrides file doesn't have the id column", async () => {
        const overridesContent = loadFixture(
          "overrides-without-transaction-id",
          "csv"
        );
        const resp = await request(app)
          .post("/api/v1/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({
          error: "cannot find column id in the overrides file",
        });
      });

      test("should render 400 if the overrides file doesn't have the coefficient column", async () => {
        const overridesContent = loadFixture(
          "overrides-without-coefficient",
          "csv"
        );
        const resp = await request(app)
          .post("/api/v1/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({
          error: "cannot find column coefficient in the overrides file",
        });
      });

      test("should render 400 if the overrides file has invalid coefficients", async () => {
        const overridesContent = loadFixture(
          "overrides-with-invalid-coefficient",
          "csv"
        );
        const resp = await request(app)
          .post("/api/v1/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({
          error:
            "Row 2 in the overrides file is invalid: Coefficient must be a number, found: what",
        });
      });
    });

    describe("passport eligibility", () => {
      beforeEach(async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds/0x2/votes.json": "votes",
          "1/rounds/0x2/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });
      });

      describe("should enable passport by query param", async () => {
        test("doesn't count votes without a success in evidence when no threshold is provided", async () => {
          const expectedResults = [
            {
              applicationId: "application-id-1",
              projectId: "project-id-1",
              totalReceived: "200",
              sumOfSqrt: "20",
              matched: "200",
              matchedUSD: 0,
              matchedWithoutCap: "200",
              capOverflow: "0",
              contributionsCount: "4",
              payoutAddress: "grant-address-1",
            },
            {
              applicationId: "application-id-2",
              projectId: "project-id-2",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-2",
            },
            {
              applicationId: "application-id-3",
              projectId: "project-id-3",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-3",
            },
          ];

          const resp = await request(app).get(
            "/api/v1/chains/1/rounds/0x1234/matches?enablePassport=true"
          );
          expect(resp.statusCode).toBe(200);
          expect(resp.body).toEqual(expectedResults);
        });

        test("doesn't count votes under the threshold when threshold is provided", async () => {
          const expectedResults = [
            {
              applicationId: "application-id-1",
              projectId: "project-id-1",
              totalReceived: "200",
              sumOfSqrt: "20",
              matched: "200",
              matchedUSD: 0,
              matchedWithoutCap: "200",
              capOverflow: "0",
              contributionsCount: "4",
              payoutAddress: "grant-address-1",
            },
            {
              applicationId: "application-id-2",
              projectId: "project-id-2",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-2",
            },
            {
              applicationId: "application-id-3",
              projectId: "project-id-3",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-3",
            },
          ];

          const resp = await request(app).get(
            "/api/v1/chains/1/rounds/0x1234/matches?enablePassport=true&passportThreshold=15"
          );
          expect(resp.statusCode).toBe(200);
          expect(resp.body).toEqual(expectedResults);
        });

        test("enables passport from round metadata and respects success in evidence when no threshold provided", async () => {
          const expectedResults = [
            {
              applicationId: "application-id-1",
              projectId: "project-id-1",
              totalReceived: "200",
              sumOfSqrt: "20",
              matched: "200",
              matchedUSD: 0,
              matchedWithoutCap: "200",
              capOverflow: "0",
              contributionsCount: "4",
              payoutAddress: "grant-address-1",
            },
            {
              applicationId: "application-id-2",
              projectId: "project-id-2",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-2",
            },
            {
              applicationId: "application-id-3",
              projectId: "project-id-3",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-3",
            },
          ];

          const resp = await request(app).get(
            "/api/v1/chains/1/rounds/0x2/matches"
          );
          expect(resp.statusCode).toBe(200);
          expect(resp.body).toEqual(expectedResults);
        });

        test("enables passport from round metadata and doesn't count votes under the threshold when threshold is provided", async () => {
          const expectedResults = [
            {
              applicationId: "application-id-1",
              projectId: "project-id-1",
              totalReceived: "200",
              sumOfSqrt: "20",
              matched: "200",
              matchedUSD: 0,
              matchedWithoutCap: "200",
              capOverflow: "0",
              contributionsCount: "4",
              payoutAddress: "grant-address-1",
            },
            {
              applicationId: "application-id-2",
              projectId: "project-id-2",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-2",
            },
            {
              applicationId: "application-id-3",
              projectId: "project-id-3",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-3",
            },
          ];

          const resp = await request(app).get(
            "/api/v1/chains/1/rounds/0x2/matches?passportThreshold=15"
          );
          expect(resp.statusCode).toBe(200);
          expect(resp.body).toEqual(expectedResults);
        });
      });
    });

    describe("matching cap", () => {
      beforeEach(async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds/0x3/votes.json": "votes",
          "1/rounds/0x3/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });
      });

      test("should enable matching cap from query param", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "1000",
            matchedUSD: 0,
            matchedWithoutCap: "1360",
            capOverflow: "360",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "1000",
            matchedUSD: 0,
            matchedWithoutCap: "2160",
            capOverflow: "1160",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "1000",
            matchedUSD: 0,
            matchedWithoutCap: "6480",
            capOverflow: "5480",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches?matchingCapAmount=1000"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
      });

      test("should enable matching cap from round metadata", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "1000",
            matchedUSD: 0,
            matchedWithoutCap: "1360",
            capOverflow: "360",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "1000",
            matchedUSD: 0,
            matchedWithoutCap: "2160",
            capOverflow: "1160",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "1000",
            matchedUSD: 0,
            matchedWithoutCap: "6480",
            capOverflow: "5480",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x3/matches"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
      });

      test("should not enable matching cap when not enabled by round metadata or query param", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "1360",
            matchedUSD: 0,
            matchedWithoutCap: "1360",
            capOverflow: "0",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "2160",
            matchedUSD: 0,
            matchedWithoutCap: "2160",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "6480",
            matchedUSD: 0,
            matchedWithoutCap: "6480",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/api/v1/chains/1/rounds/0x1234/matches"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
      });
    });

    describe("minimum amount", () => {
      beforeEach(async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds/0x4/votes.json": "votes",
          "1/rounds/0x4/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });
      });

      describe("should enable minimum amount by query param", async () => {
        test("doesn't count votes with value under specified amount", async () => {
          const expectedResults = [
            {
              applicationId: "application-id-1",
              capOverflow: "0",
              contributionsCount: "4",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              payoutAddress: "grant-address-1",
              projectId: "project-id-1",
              sumOfSqrt: "30",
              totalReceived: "900",
            },
            {
              applicationId: "application-id-2",
              projectId: "project-id-2",
              totalReceived: "0",
              sumOfSqrt: "0",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-2",
            },
            {
              applicationId: "application-id-3",
              capOverflow: "0",
              contributionsCount: "7",
              matched: "5400",
              matchedUSD: 0,
              matchedWithoutCap: "5400",
              payoutAddress: "grant-address-3",
              projectId: "project-id-3",
              sumOfSqrt: "90",
              totalReceived: "2700",
            },
          ];

          const resp = await request(app).get(
            "/api/v1/chains/1/rounds/0x1234/matches?minimumAmountUSD=5"
          );
          expect(resp.statusCode).toBe(200);
          expect(resp.body).toEqual(expectedResults);
        });
      });

      describe("should enable minimum amount from round metadata", async () => {
        test("doesn't count votes with value under specified amount", async () => {
          const expectedResults = [
            {
              applicationId: "application-id-1",
              capOverflow: "0",
              contributionsCount: "4",
              matched: "1176",
              matchedUSD: 0,
              matchedWithoutCap: "1176",
              payoutAddress: "grant-address-1",
              projectId: "project-id-1",
              sumOfSqrt: "50",
              totalReceived: "1300",
            },
            {
              applicationId: "application-id-2",
              projectId: "project-id-2",
              sumOfSqrt: "20",
              totalReceived: "400",
              matched: "0",
              matchedUSD: 0,
              matchedWithoutCap: "0",
              capOverflow: "0",
              contributionsCount: "7",
              payoutAddress: "grant-address-2",
            },
            {
              applicationId: "application-id-3",
              capOverflow: "0",
              contributionsCount: "7",
              matched: "8823",
              matchedUSD: 0,
              matchedWithoutCap: "8823",
              payoutAddress: "grant-address-3",
              projectId: "project-id-3",
              sumOfSqrt: "110",
              totalReceived: "3100",
            },
          ];

          const resp = await request(app).get(
            "/api/v1/chains/1/rounds/0x4/matches"
          );
          expect(resp.statusCode).toBe(200);
          expect(resp.body).toEqual(expectedResults);
        });
      });
    });
  });
});
