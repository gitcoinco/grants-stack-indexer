import { Database } from "../../database/index.js";
import { DataProvider } from "./index.js";
import {
  type DeprecatedVote,
  type DeprecatedDetailedVote,
  createDeprecatedRound,
  createDeprecatedVote,
  createDeprecatedProject,
  createDeprecatedApplication,
} from "../../deprecatedJsonDatabase.js";
import { parseAddress } from "../../address.js";
import { FileNotFoundError } from "../errors.js";
import { z } from "zod";

function parseRoundId(id: string): string {
  if (id.startsWith("0x")) {
    return parseAddress(id);
  }

  return id;
}

export class DatabaseDataProvider implements DataProvider {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async loadFile<T>(description: string, path: string): Promise<Array<T>> {
    const segments = path.split("/");

    // /:chainId/contributors/a1/a2/a3/a4/a5/a6/a7.json
    if (segments.length === 9 && segments[1] === "contributors") {
      const chainId = Number(segments[0]);
      const address = parseAddress(
        segments
          .slice(2, segments.length)
          .map((s) => s.slice(0, 6))
          .join("")
      );

      const donations =
        await this.#db.getDonationsByDonorAddressWithProjectAndRound(
          chainId,
          address
        );

      const deprecatedContributions: DeprecatedDetailedVote[] =
        donations.flatMap((d) => {
          const roundSchema = z.object({
            name: z.string(),
          });

          const projectSchema = z.object({
            title: z.string(),
          });

          const roundMetadata = roundSchema.safeParse(d.roundMetadata);
          const projectMetadata = projectSchema.safeParse(d.projectMetadata);

          if (!roundMetadata.success || !projectMetadata.success) {
            return [];
          }

          if (d.donationsStartTime === null || d.donationsEndTime === null) {
            return [];
          }

          return [
            {
              ...createDeprecatedVote(d),
              roundName: roundMetadata.data.name,
              projectTitle: projectMetadata.data.title,
              roundStartTime: Math.trunc(
                d.donationsStartTime.getTime() / 1000
              ).toString(),
              roundEndTime: Math.trunc(
                d.donationsEndTime.getTime() / 1000
              ).toString(),
            },
          ];
        });

      return deprecatedContributions as Array<T>;
    }

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
      const roundId = parseRoundId(segments[2]);

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
      const roundId = parseRoundId(segments[2]);

      const donations = await this.#db.getAllRoundDonations(chainId, roundId);

      const votes: DeprecatedVote[] = donations.map(createDeprecatedVote);

      return votes as unknown as Array<T>;
    }

    throw new FileNotFoundError(description);
  }
}
