import fs from "fs";
import path from "path";
import request from "supertest";
import { app, calculatorConfig } from "../server.js";
import { FileNotFoundError } from "../calculator.js";

const loadFixture = (name: string) => {
  const p = path.resolve(__dirname, "fixtures", `${name}.json`);
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
      test("should render 404 if round is not present in rounds.json", (done) => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": [], // empty file so the round won't be found
          "passport_scores.json": "passport_scores",
        });

        request(app).get("/chains/1/rounds/0x1234/matches").expect(404, done);
      });

      test("should render 404 if rounds file doesn't exist", (done) => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": undefined,
          "passport_scores.json": "passport_scores",
        });

        request(app).get("/chains/1/rounds/0x1234/matches").expect(404, done);
      });

      test("should render 404 if votes file doesn't exist", (done) => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": undefined,
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        request(app).get("/chains/1/rounds/0x1234/matches").expect(404, done);
      });

      test("should render 404 if applications file doesn't exist", (done) => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": undefined,
          "1/rounds.json": "rounds",
          "passport_scores.json": "passport_scores",
        });

        request(app).get("/chains/1/rounds/0x1234/matches").expect(404, done);
      });

      test("should render 404 if passport_scores file doesn't exist", (done) => {
        calculatorConfig.dataProvider = new TestDataProvider({
          "1/rounds/0x1234/votes.json": "votes",
          "1/rounds/0x1234/applications.json": "applications",
          "1/rounds.json": "rounds",
          "passport_scores.json": undefined,
        });

        request(app).get("/chains/1/rounds/0x1234/matches").expect(404, done);
      });
    });
  });
});
