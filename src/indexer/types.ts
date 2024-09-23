export type DVMDApplicationData = {
  anchorAddress: string;
  recipientAddress: string;
  metadata: {
    protocol: number;
    pointer: string;
  };
};

export type DVMDExtendedApplicationData = DVMDApplicationData & {
  recipientsCounter: string;
};

export type DGApplicationData = {
  recipientAddress: string;
  anchorAddress: string;
  grantAmount: bigint;
  metadata: {
    protocol: number;
    pointer: string;
  };
};

export type DVMDTimeStampUpdatedData = {
  registrationStartTime: bigint;
  registrationEndTime: bigint;
  allocationStartTime: bigint;
  allocationEndTime: bigint;
};

export type DGTimeStampUpdatedData = {
  registrationStartTime: bigint;
  registrationEndTime: bigint;
};

export type GitcoinAttestedData = {
  projectsContributed: bigint;
  roundsCountributed: bigint;
  chainIdsContributed: bigint;
  totalUSDAmount: bigint;
  timestamp: bigint;
  metadataCid: string;
};

export type AttestationTxnData = {
  chainId: number;
  txnHash: string;
  impactImage?: string;
};

export type AttestationProjectData = {
  id: string;
  title: string;
  anchor: string;
  applicationId: string;
  applicationCId: string;
  payoutAddress: string;
  roundId: number;
  strategy: string;
  amountInUSD: bigint;
  amount: bigint;
  token: string;
};

export type AttestationMetadata = AttestationTxnData & {
  projects: AttestationProjectData[];
};
