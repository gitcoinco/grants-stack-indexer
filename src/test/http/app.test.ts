import { describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { app, calculatorConfig } from "../../http/app.js";
import { FileNotFoundError } from "../../calculator/index.js";

const loadFixture = (name: string, extension = "json") => {
  const p = path.resolve(__dirname, "../fixtures", `${name}.${extension}`);
  const data = fs.readFileSync(p, { encoding: "utf8", flag: "r" });
  return data;
};

class TestDataProvider {
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

      test("should render calculations", async () => {
        const expectedResults = [
          {
            applicationId: "application-id-1",
            projectId: "project-id-1",
            totalReceived: 15,
            sumOfSqrt: 7,
            matched: 13.6,
          },
          {
            applicationId: "application-id-2",
            projectId: "project-id-2",
            totalReceived: 10,
            sumOfSqrt: 8,
            matched: 21.6,
          },
          {
            applicationId: "application-id-3",
            projectId: "project-id-3",
            totalReceived: 34,
            sumOfSqrt: 14,
            matched: 64.8,
          },
        ];

        const resp = await request(app).get("/chains/1/rounds/0x1234/matches");
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

      test("should render 400 if the overrides file doesn't have the transactionId column", async () => {
        const overridesContent = loadFixture(
          "overrides-without-transaction-id",
          "csv"
        );
        const resp = await request(app)
          .post("/chains/1/rounds/0x1234/matches")
          .attach("overrides", Buffer.from(overridesContent), "overrides.csv");
        expect(resp.statusCode).toBe(400);
        expect(resp.body).toEqual({
          error: "cannot find column transactionId in the overrides file",
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
    });
  });
});