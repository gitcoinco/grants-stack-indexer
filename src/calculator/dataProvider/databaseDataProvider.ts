import { Database } from "../../database/index.js";
import { DataProvider } from "./index.js";
import {
  type DeprecatedVote,
  createDeprecatedRound,
  createDeprecatedVote,
  createDeprecatedProject,
  createDeprecatedApplication,
} from "../../deprecatedJsonDatabase.js";
import { parseAddress } from "../../address.js";
import { FileNotFoundError } from "../errors.js";

export class DatabaseDataProvider implements DataProvider {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async loadFile<T>(description: string, path: string): Promise<Array<T>> {
    const segments = path.split("/");

    // /:chainId/rounds.json
    if (segments.length === 2 && segments[1] === "rounds.json") {
      const chainId = Number(segments[0]);

      const rounds = await this.#db.getAllChainRounds(chainId);

      const deprecatedRounds = rounds.map(createDeprecatedRound);

      return deprecatedRounds as unknown as Array<T>;
    }

    // /:chainId/projects.json
    if (segments.length === 2 && segments[1] === "projects.json") {
      const chainId = Number(segments[0]);

      const projects = await this.#db.getAllChainProjects(chainId);
      const deprecatedProjects = projects.map(createDeprecatedProject);

      return deprecatedProjects as unknown as Array<T>;
    }

    // /:chainId/rounds/:roundId/applications.json
    if (
      segments.length === 4 &&
      segments[1] === "rounds" &&
      segments[3] === "applications.json"
    ) {
      const chainId = Number(segments[0]);
      const roundId = parseAddress(segments[2]);

      const applications = await this.#db.getAllRoundApplications(
        chainId,
        roundId
      );

      const deprecatedApplications = applications.map(
        createDeprecatedApplication
      );

      return deprecatedApplications as unknown as Array<T>;
    }

    // /:chainId/rounds/:roundId/votes.json
    if (
      segments.length === 4 &&
      segments[1] === "rounds" &&
      segments[3] === "votes.json"
    ) {
      const chainId = Number(segments[0]);
      const roundId = parseAddress(segments[2]);

      const donations = await this.#db.getAllRoundDonations(chainId, roundId);

      const votes: DeprecatedVote[] = donations.map(createDeprecatedVote);

      return votes as unknown as Array<T>;
    }

    throw new FileNotFoundError(description);
  }
}
