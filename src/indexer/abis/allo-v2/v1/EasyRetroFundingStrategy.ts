export default [
  {
    type: "constructor",
    inputs: [
      { name: "_allo", type: "address", internalType: "address" },
      { name: "_name", type: "string", internalType: "string" },
    ],
    stateMutability: "nonpayable",
  },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    name: "NATIVE",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allocate",
    inputs: [
      { name: "_data", type: "bytes", internalType: "bytes" },
      { name: "_sender", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "distribute",
    inputs: [
      {
        name: "_recipientIds",
        type: "address[]",
        internalType: "address[]",
      },
      { name: "_data", type: "bytes", internalType: "bytes" },
      { name: "_sender", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "distributionMetadata",
    inputs: [],
    outputs: [
      { name: "protocol", type: "uint256", internalType: "uint256" },
      { name: "pointer", type: "string", internalType: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "distributionStarted",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllo",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IAllo" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPayouts",
    inputs: [
      {
        name: "_recipientIds",
        type: "address[]",
        internalType: "address[]",
      },
      { name: "_data", type: "bytes[]", internalType: "bytes[]" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct IStrategy.PayoutSummary[]",
        components: [
          {
            name: "recipientAddress",
            type: "address",
            internalType: "address",
          },
          { name: "amount", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRecipient",
    inputs: [
      { name: "_recipientId", type: "address", internalType: "address" },
    ],
    outputs: [
      {
        name: "recipient",
        type: "tuple",
        internalType: "struct EasyRetroFundingStrategy.Recipient",
        components: [
          {
            name: "useRegistryAnchor",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "recipientAddress",
            type: "address",
            internalType: "address",
          },
          {
            name: "metadata",
            type: "tuple",
            internalType: "struct Metadata",
            components: [
              {
                name: "protocol",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "pointer",
                type: "string",
                internalType: "string",
              },
            ],
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRecipientStatus",
    inputs: [
      { name: "_recipientId", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "", type: "uint8", internalType: "enum IStrategy.Status" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStrategyId",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasBeenDistributed",
    inputs: [{ name: "_index", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "increasePoolAmount",
    inputs: [{ name: "_amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "_poolId", type: "uint256", internalType: "uint256" },
      { name: "_data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isDistributionSet",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isPoolActive",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isValidAllocator",
    inputs: [{ name: "_allocator", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "metadataRequired",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "multicall",
    inputs: [{ name: "data", type: "bytes[]", internalType: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]", internalType: "bytes[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "poolEndTime",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolStartTime",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recipientToStatusIndexes",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recipientsCounter",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "registerRecipient",
    inputs: [
      { name: "_data", type: "bytes", internalType: "bytes" },
      { name: "_sender", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "recipientId", type: "address", internalType: "address" },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "registrationEndTime",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "registrationStartTime",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reviewRecipients",
    inputs: [
      {
        name: "statuses",
        type: "tuple[]",
        internalType: "struct EasyRetroFundingStrategy.ApplicationStatus[]",
        components: [
          { name: "index", type: "uint256", internalType: "uint256" },
          {
            name: "statusRow",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "refRecipientsCounter",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "statusesBitMap",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalPayoutAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updateDistribution",
    inputs: [
      {
        name: "_distributionMetadata",
        type: "tuple",
        internalType: "struct Metadata",
        components: [
          {
            name: "protocol",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "pointer", type: "string", internalType: "string" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updatePoolTimestamps",
    inputs: [
      {
        name: "_registrationStartTime",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "_registrationEndTime",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "_poolStartTime",
        type: "uint64",
        internalType: "uint64",
      },
      { name: "_poolEndTime", type: "uint64", internalType: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "useRegistryAnchor",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "_token", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Allocated",
    inputs: [
      {
        name: "recipientId",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "token",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BatchPayoutSuccessful",
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Distributed",
    inputs: [
      {
        name: "recipientId",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "recipientAddress",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DistributionUpdated",
    inputs: [
      {
        name: "metadata",
        type: "tuple",
        indexed: false,
        internalType: "struct Metadata",
        components: [
          {
            name: "protocol",
            type: "uint256",
            internalType: "uint256",
          },
          { name: "pointer", type: "string", internalType: "string" },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FundsDistributed",
    inputs: [
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "grantee",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "recipientId",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Initialized",
    inputs: [
      {
        name: "poolId",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "data",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PoolActive",
    inputs: [
      {
        name: "active",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RecipientStatusUpdated",
    inputs: [
      {
        name: "rowIndex",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "fullRow",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      {
        name: "recipientId",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "data",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TimestampsUpdated",
    inputs: [
      {
        name: "registrationStartTime",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "registrationEndTime",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "poolStartTime",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "poolEndTime",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdatedRegistration",
    inputs: [
      {
        name: "recipientId",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "data",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "status",
        type: "uint8",
        indexed: false,
        internalType: "uint8",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "ALLOCATION_ACTIVE", inputs: [] },
  { type: "error", name: "ALLOCATION_NOT_ACTIVE", inputs: [] },
  { type: "error", name: "ALLOCATION_NOT_ENDED", inputs: [] },
  { type: "error", name: "ALREADY_INITIALIZED", inputs: [] },
  { type: "error", name: "AMOUNT_MISMATCH", inputs: [] },
  { type: "error", name: "ANCHOR_ERROR", inputs: [] },
  { type: "error", name: "ARRAY_MISMATCH", inputs: [] },
  { type: "error", name: "INVALID", inputs: [] },
  { type: "error", name: "INVALID_ADDRESS", inputs: [] },
  { type: "error", name: "INVALID_FEE", inputs: [] },
  { type: "error", name: "INVALID_METADATA", inputs: [] },
  { type: "error", name: "INVALID_REGISTRATION", inputs: [] },
  { type: "error", name: "IS_APPROVED_STRATEGY", inputs: [] },
  { type: "error", name: "MISMATCH", inputs: [] },
  { type: "error", name: "NONCE_NOT_AVAILABLE", inputs: [] },
  { type: "error", name: "NON_ZERO_VALUE", inputs: [] },
  { type: "error", name: "NOT_APPROVED_STRATEGY", inputs: [] },
  { type: "error", name: "NOT_ENOUGH_FUNDS", inputs: [] },
  { type: "error", name: "NOT_IMPLEMENTED", inputs: [] },
  { type: "error", name: "NOT_INITIALIZED", inputs: [] },
  { type: "error", name: "NOT_PENDING_OWNER", inputs: [] },
  { type: "error", name: "POOL_ACTIVE", inputs: [] },
  { type: "error", name: "POOL_INACTIVE", inputs: [] },
  { type: "error", name: "POOL_NOT_ENDED", inputs: [] },
  { type: "error", name: "RECIPIENT_ALREADY_ACCEPTED", inputs: [] },
  {
    type: "error",
    name: "RECIPIENT_ERROR",
    inputs: [{ name: "recipientId", type: "address", internalType: "address" }],
  },
  { type: "error", name: "RECIPIENT_NOT_ACCEPTED", inputs: [] },
  { type: "error", name: "REGISTRATION_ACTIVE", inputs: [] },
  { type: "error", name: "REGISTRATION_NOT_ACTIVE", inputs: [] },
  { type: "error", name: "UNAUTHORIZED", inputs: [] },
  { type: "error", name: "ZERO_ADDRESS", inputs: [] },
] as const;
