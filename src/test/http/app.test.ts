import { vi, describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { app, calculatorConfig } from "../../http/app.js";
import { FileNotFoundError } from "../../calculator/index.js";

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

export class TestDataProvider {
  routes: { [path: string]: string };

  constructor(routes: { [path: string]: string | any }) {
    this.routes = routes;
  }

  loadFile(description: string, path: string) {
    const fixture = this.routes[path];
    if (fixture === undefined) {
      throw new FileNotFoundError(description);
    }

    if (typeof fixture !== "string") {
      return fixture;
    }

    return JSON.parse(loadFixture(fixture));
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

        const resp = await request(app).get("/chains/1/rounds/0x1234/matches");
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if rounds file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": undefined,
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get("/chains/1/rounds/0x1234/matches");
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if votes file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": undefined,
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get("/chains/1/rounds/0x1234/matches");
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if applications file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": undefined,
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        const resp = await request(app).get("/chains/1/rounds/0x1234/matches");
        expect(resp.status).toEqual(404);
      });

      test("should render 404 if passport_scores file doesn't exist", async () => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": undefined,
        });

        const resp = await request(app).get("/chains/1/rounds/0x1234/matches");
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
          "/chains/1/rounds/0x1234/matches?ignoreSaturation=true"
        );
        expect(resp.statusCode).toBe(200);
        expect(resp.body).toEqual(expectedResults);
      });

      test("should render calculations with ignore saturation false", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: "1500",
            sumOfSqrt: "70",
            matched: "802",
            matchedUSD: 0,
            matchedWithoutCap: "802",
            capOverflow: "0",
            contributionsCount: "4",
            payoutAddress: "grant-address-1",
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: "1000",
            sumOfSqrt: "80",
            matched: "1274",
            matchedUSD: 0,
            matchedWithoutCap: "1274",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-2",
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: "3400",
            sumOfSqrt: "140",
            matched: "3823",
            matchedUSD: 0,
            matchedWithoutCap: "3823",
            capOverflow: "0",
            contributionsCount: "7",
            payoutAddress: "grant-address-3",
          },
        ];

        const resp = await request(app).get(
          "/chains/1/rounds/0x1234/matches?ignoreSaturation=false"
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
          .post("/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");

        expect(resp.statusCode).toBe(201);

        const projects = new Set(resp.body.map((p: any) => p.projectId));

        // all votes for projects 1 are overridden with coefficient 0
        // so the calculations should only contains poject 2 and 3.
        expect(resp.body.length).toBe(2);
        expect(projects.has("project-id-1")).toBe(false);
        expect(projects.has("project-id-2")).toBe(true);
        expect(projects.has("project-id-3")).toBe(true);
      });

      test("should render 400 if no overrides file has been uploaded", async () => {
        const resp = await request(app).post("/chains/1/rounds/0x1234/matches");
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({ error: "overrides param required" });
      });

      test("should render 400 if the overrides file doesn't have the id column", async () => {
        const overridesContent = loadFixture(
          "overrides-without-transaction-id",
          "csv"
        );
        const resp = await request(app)
          .post("/chains/1/rounds/0x1234/matches")
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
          .post("/chains/1/rounds/0x1234/matches")
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
          .post("/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({
          error:
            "Row 2 in the overrides file is invalid: Coefficient must be 0 or 1, found: what",
        });
      });
    });
  });
});
