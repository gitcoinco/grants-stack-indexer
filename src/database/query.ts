import { Round, Donation, Application, Project, Price } from "./schema.js";
import { Address, ChainId } from "../types.js";

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
    }
  | {
      query: {
        type: "LatestPriceTimestampForChain";
        chainId: ChainId;
      };
      response: Date | null;
    }
  | {
      query: {
        type: "AllChainPrices";
        chainId: ChainId;
      };
      response: Price[];
    }
  | {
      query: {
        type: "TokenPriceByBlockNumber";
        chainId: ChainId;
        tokenAddress: Address;
        blockNumber: bigint | "latest";
      };
      response: Price | null;
    }
  | {
      query: {
        type: "AllChainProjects";
        chainId: ChainId;
      };
      response: Project[];
    };
