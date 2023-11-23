import {
  NewProject,
  PartialProject,
  NewRound,
  PartialRound,
  NewApplication,
  PartialApplication,
  Address,
  ChainId,
  NewDonation,
} from "./schema.js";

export type Mutation =
  | {
      type: "InsertProject";
      project: NewProject;
    }
  | {
      type: "UpdateProject";
      projectId: string;
      project: PartialProject;
    }
  | {
      type: "InsertRound";
      round: NewRound;
    }
  | {
      type: "UpdateRound";
      roundId: Address;
      chainId: ChainId;
      round: PartialRound;
    }
  | {
      type: "InsertApplication";
      application: NewApplication;
    }
  | {
      type: "UpdateApplication";
      roundId: Address;
      chainId: ChainId;
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
    };
