import type { Event as ChainsauceEvent } from "chainsauce";
import type { Hex, MetaPtr } from "./types.js";

export interface RoundMetaPtrUpdatedEvent extends ChainsauceEvent {
  name: "RoundMetaPtrUpdated";
  params: {
    newMetaPtr: MetaPtr;
  };
}

export interface MatchAmountUpdatedEvent extends ChainsauceEvent {
  name: "MatchAmountUpdated";
  params: {
    newAmount: bigint;
  };
}

export interface ApplicationMetaPtrUpdatedEvent extends ChainsauceEvent {
  name: "ApplicationMetaPtrUpdated";
  params: {
    newMetaPtr: MetaPtr;
  };
}

export interface NewProjectApplicationEvent extends ChainsauceEvent {
  name: "NewProjectApplication";
  params: {
    projectID: bigint;
    project: string;
    applicationIndex: bigint;
    applicationMetaPtr: MetaPtr;
  };
}

export interface ProjectsMetaPtrUpdatedEvent extends ChainsauceEvent {
  name: "ProjectsMetaPtrUpdated";
  params: {
    newMetaPtr: MetaPtr;
  };
}

export interface ApplicationStatusesUpdatedEvent extends ChainsauceEvent {
  name: "ApplicationStatusesUpdated";
  params: {
    index: bigint;
    status: bigint;
  };
}

export interface VotingContractCreatedV1Event extends ChainsauceEvent {
  name: "VotingContractCreatedV1";
  params: {
    votingContractAddress: string;
  };
}

export interface VotingContractCreatedEvent extends ChainsauceEvent {
  name: "VotingContractCreated";
  params: {
    votingContractAddress: string;
  };
}

export interface VotedEvent extends ChainsauceEvent {
  name: "Voted";
  params: {
    roundAddress: Hex;
    applicationIndex?: bigint;
    projectId: string;
    amount: bigint;
    grantAddress: Hex;
    voter: Hex;
    contributor: Hex;
    token: Hex;
    origin?: string;
  };
}

export interface ProjectCreatedEvent extends ChainsauceEvent {
  name: "ProjectCreated";
  params: {
    projectID: bigint;
    owner: Hex;
  };
}

export interface MetadataUpdatedEvent extends ChainsauceEvent {
  name: "MetadataUpdated";
  params: {
    projectID: bigint;
    metaPtr: MetaPtr;
  };
}

export interface OwnerAddedEvent extends ChainsauceEvent {
  name: "OwnerAdded";
  params: {
    projectID: bigint;
    owner: Hex;
  };
}

export interface OwnerRemovedEvent extends ChainsauceEvent {
  name: "OwnerRemoved";
  params: {
    projectID: bigint;
    owner: Hex;
  };
}

export interface RoundCreatedV1Event extends ChainsauceEvent {
  name: "RoundCreatedV1";
  params: {
    roundAddress: Hex;
    token: Hex;
  };
}

export interface RoundCreatedEvent extends ChainsauceEvent {
  name: "RoundCreated";
  params: {
    roundAddress: Hex;
    token: Hex;
  };
}

export interface PayoutContractCreatedEvent extends ChainsauceEvent {
  name: "PayoutContractCreated";
  params: {
    payoutContractAddress: Hex;
    payoutImplementation: Hex;
  };
}

export interface ApplicationInReviewUpdatedEvent extends ChainsauceEvent {
  name: "ApplicationInReviewUpdated";
  params: {
    index: bigint;
    status: bigint;
  };
}

export type Event =
  | RoundMetaPtrUpdatedEvent
  | MatchAmountUpdatedEvent
  | ApplicationMetaPtrUpdatedEvent
  | NewProjectApplicationEvent
  | ProjectsMetaPtrUpdatedEvent
  | ApplicationStatusesUpdatedEvent
  | VotingContractCreatedV1Event
  | VotingContractCreatedEvent
  | VotedEvent
  | ProjectCreatedEvent
  | MetadataUpdatedEvent
  | OwnerAddedEvent
  | OwnerRemovedEvent
  | RoundCreatedV1Event
  | RoundCreatedEvent
  | PayoutContractCreatedEvent
  | ApplicationInReviewUpdatedEvent;
