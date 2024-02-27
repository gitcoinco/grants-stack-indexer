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
