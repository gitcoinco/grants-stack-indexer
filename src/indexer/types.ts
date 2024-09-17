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
