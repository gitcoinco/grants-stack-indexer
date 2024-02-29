export default [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "alloV1",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "alloV1ChainId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "alloV2",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
    ],
    name: "ProfileMigrated",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "alloV1ToAlloV1V2Profile",
    outputs: [
      {
        internalType: "bytes32",
        name: "alloV1",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "alloV1ChainId",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "alloV2",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "alloV2ToAlloV1V2Profile",
    outputs: [
      {
        internalType: "bytes32",
        name: "alloV1",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "alloV1ChainId",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "alloV2",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_registry",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "_encodedData",
        type: "bytes",
      },
    ],
    name: "createProfiles",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
