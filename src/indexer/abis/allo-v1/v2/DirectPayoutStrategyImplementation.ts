export default [
  {
    inputs: [],
    name: "DirectStrategy__payout_ApplicationNotAccepted",
    type: "error",
  },
  {
    inputs: [],
    name: "DirectStrategy__payout_NativeTokenNotAllowed",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "status",
        type: "uint256",
      },
    ],
    name: "ApplicationInReviewUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "version",
        type: "uint8",
      },
    ],
    name: "Initialized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "protocolFee",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "roundFee",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "grantAddress",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "projectId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "applicationIndex",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "allowanceModule",
        type: "address",
      },
    ],
    name: "PayoutMade",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [],
    name: "ReadyForPayout",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "vaultAddress",
        type: "address",
      },
    ],
    name: "VaultAddressUpdated",
    type: "event",
  },
  {
    inputs: [],
    name: "ROUND_OPERATOR_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_allowanceModule",
        type: "address",
      },
      {
        internalType: "address",
        name: "_roundOperator",
        type: "address",
      },
      {
        internalType: "address",
        name: "_token",
        type: "address",
      },
      {
        internalType: "address",
        name: "_to",
        type: "address",
      },
      {
        internalType: "uint96",
        name: "_amount",
        type: "uint96",
      },
    ],
    name: "generateTransferHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "inReviewApplicationsBitMap",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "init",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "applicationIndex",
        type: "uint256",
      },
    ],
    name: "isApplicationInReview",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "isReadyForPayout",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "vault",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint96",
            name: "amount",
            type: "uint96",
          },
          {
            internalType: "address",
            name: "grantAddress",
            type: "address",
          },
          {
            internalType: "bytes32",
            name: "projectId",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "applicationIndex",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "allowanceModule",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "allowanceSignature",
            type: "bytes",
          },
        ],
        internalType: "struct DirectPayoutStrategyImplementation.Payment",
        name: "_payment",
        type: "tuple",
      },
    ],
    name: "payout",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "roundAddress",
    outputs: [
      {
        internalType: "address payable",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "index",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "statusRow",
            type: "uint256",
          },
        ],
        internalType:
          "struct DirectPayoutStrategyImplementation.ApplicationStatus[]",
        name: "statuses",
        type: "tuple[]",
      },
    ],
    name: "setApplicationsInReview",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "setReadyForPayout",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "tokenAddress",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_newVaultAddress",
        type: "address",
      },
    ],
    name: "updateVaultAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "vaultAddress",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
] as const;
