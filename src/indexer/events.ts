import type { Event as ChainsauceEvent } from "chainsauce";
import type { MetaPtr } from "./types.js";
import type { ethers } from "ethers";

// Blockchain events and their arguments
type EventArguments = {
  RoundMetaPtrUpdated: {
    newMetaPtr: MetaPtr;
  };
  MatchAmountUpdated: {
    newAmount: ethers.BigNumber;
  };
  ApplicationMetaPtrUpdated: {
    newMetaPtr: MetaPtr;
  };
  NewProjectApplication: {
    projectID: ethers.BigNumber;
    project: string;
    applicationIndex: ethers.BigNumber;
    applicationMetaPtr: MetaPtr;
  };
  ProjectsMetaPtrUpdated: {
    newMetaPtr: MetaPtr;
  };
  ApplicationStatusesUpdated: {
    index: ethers.BigNumber;
    status: ethers.BigNumber;
  };
  VotingContractCreatedV1: {
    votingContractAddress: string;
  };
  VotingContractCreated: {
    votingContractAddress: string;
  };
  Voted: {
    roundAddress: string;
    applicationIndex?: ethers.BigNumber;
    projectId: string;
    amount: ethers.BigNumber;
    grantAddress: string;
    voter: string;
    contributor: string;
    token: string;
  };
  ProjectCreated: {
    projectID: ethers.BigNumber;
    owner: string;
  };
  MetadataUpdated: {
    projectID: ethers.BigNumber;
    metaPtr: MetaPtr;
  };
  OwnerAdded: {
    projectID: ethers.BigNumber;
    owner: string;
  };
  OwnerRemoved: {
    projectID: ethers.BigNumber;
    owner: string;
  };
  RoundCreatedV1: {
    roundAddress: string;
    token: string;
  };
  RoundCreated: {
    roundAddress: string;
    token: string;
  };
};

export type Events = {
  [A in keyof EventArguments]: Omit<ChainsauceEvent, "name" | "args"> & {
    name: A;
    args: EventArguments[A];
  };
};

export type Event = Events[keyof Events];
