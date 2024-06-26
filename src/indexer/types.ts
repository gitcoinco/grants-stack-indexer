export enum ApplicationStatus {
  NONE = 0,
  PENDING,
  APPROVED,
  REJECTED,
  CANCELLED,
  IN_REVIEW,
}

export type Strategy = {
  id: string;
  name: string | null;
  groups: string[];
};

export type DVMDApplicationData = {
  recipientsCounter: string;
  anchorAddress: string;
  recipientAddress: string;
  metadata: {
    protocol: number;
    pointer: string;
  };
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

export type MACIApplicationData = {
  anchorAddress: string;
  recipientAddress: string;
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
