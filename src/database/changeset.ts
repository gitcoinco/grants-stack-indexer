import { ChainId, Address } from "../types.js";
import {
  NewProject,
  PartialProject,
  NewPendingProjectRole,
  NewProjectRole,
  ProjectRole,
  NewRound,
  PartialRound,
  NewPendingRoundRole,
  NewRoundRole,
  RoundRole,
  NewApplication,
  PartialApplication,
  NewDonation,
  NewPrice,
  NewLegacyProject,
  NewApplicationPayout,
} from "./schema.js";

export type DataChange =
  | {
      type: "InsertProject";
      project: NewProject;
    }
  | {
      type: "UpdateProject";
      chainId: ChainId;
      projectId: string;
      project: PartialProject;
    }
  | {
      type: "InsertPendingProjectRole";
      pendingProjectRole: NewPendingProjectRole;
    }
  | {
      type: "DeletePendingProjectRoles";
      ids: number[];
    }
  | {
      type: "InsertProjectRole";
      projectRole: NewProjectRole;
    }
  | {
      type: "DeleteAllProjectRolesByRole";
      projectRole: Pick<ProjectRole, "chainId" | "projectId" | "role">;
    }
  | {
      type: "DeleteAllProjectRolesByRoleAndAddress";
      projectRole: Pick<
        ProjectRole,
        "chainId" | "projectId" | "role" | "address"
      >;
    }
  | {
      type: "InsertRound";
      round: NewRound;
    }
  | {
      type: "UpdateRound";
      chainId: ChainId;
      roundId: string;
      round: PartialRound;
    }
  | {
      type: "UpdateRoundByStrategyAddress";
      chainId: ChainId;
      strategyAddress: Address;
      round: PartialRound;
    }
  | {
      type: "IncrementRoundFundedAmount";
      chainId: ChainId;
      roundId: string;
      fundedAmount: bigint;
      fundedAmountInUsd: number;
    }
  | {
      type: "IncrementRoundDonationStats";
      chainId: ChainId;
      roundId: Address;
      amountInUsd: number;
    }
  | {
      type: "IncrementApplicationDonationStats";
      chainId: ChainId;
      roundId: Address;
      applicationId: string;
      amountInUsd: number;
    }
  | {
      type: "InsertPendingRoundRole";
      pendingRoundRole: NewPendingRoundRole;
    }
  | {
      type: "DeletePendingRoundRoles";
      ids: number[];
    }
  | {
      type: "InsertRoundRole";
      roundRole: NewRoundRole;
    }
  | {
      type: "DeleteAllRoundRolesByRoleAndAddress";
      roundRole: Pick<RoundRole, "chainId" | "roundId" | "role" | "address">;
    }
  | {
      type: "InsertApplication";
      application: NewApplication;
    }
  | {
      type: "UpdateApplication";
      chainId: ChainId;
      roundId: string;
      applicationId: string;
      application: PartialApplication;
    }
  | {
      type: "InsertDonation";
      donation: NewDonation;
    }
  | {
      type: "InsertManyDonations";
      donations: NewDonation[];
    }
  | {
      type: "InsertManyPrices";
      prices: NewPrice[];
    }
  | {
      type: "NewLegacyProject";
      legacyProject: NewLegacyProject;
    }
  | {
      type: "InsertApplicationPayout";
      payout: NewApplicationPayout;
    };
