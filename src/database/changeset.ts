import { ChainId, Address } from "../types.js";
import {
  NewProject,
  PartialProject,
  NewPendingProjectRole,
  NewProjectRole,
  ProjectRole,
  NewRound,
  PartialRound,
  NewRoundRole,
  RoundRole,
  NewApplication,
  PartialApplication,
  NewDonation,
  NewPrice,
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
      roundId: Address;
      round: PartialRound;
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
      roundId: Address;
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
    };
