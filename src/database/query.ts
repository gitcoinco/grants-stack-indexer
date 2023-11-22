import {
  ChainId,
  Address,
  Round,
  Donation,
  Application,
  Project,
} from "./schema.js";

export type ExtractQuery<TQueryDefinition, TQueryName> = Extract<
  TQueryDefinition,
  { query: { type: TQueryName } }
>["query"];

export type ExtractQueryResponse<I extends { response: unknown }, T> = Extract<
  I,
  { query: { type: T } }
>["response"];

export type QueryInteraction =
  | {
      query: {
        type: "ProjectById";
        projectId: string;
      };
      response: Project | null;
    }
  | {
      query: {
        type: "RoundById";
        roundId: Address;
        chainId: ChainId;
      };
      response: Round | null;
    }
  | {
      query: {
        type: "AllChainRounds";
        chainId: ChainId;
      };
      response: Round[];
    }
  | {
      query: {
        type: "AllRoundApplications";
        chainId: ChainId;
        roundId: Address;
      };
      response: Application[];
    }
  | {
      query: {
        type: "ApplicationById";
        chainId: ChainId;
        roundId: Address;
        applicationId: string;
      };
      response: Application | null;
    }
  | {
      query: {
        type: "AllRoundDonations";
        chainId: ChainId;
        roundId: Address;
      };
      response: Donation[];
    };
