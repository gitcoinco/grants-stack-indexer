import { vi, describe, test, expect, beforeEach } from "vitest";
import { handleEvent } from "./handleEvent.js";
import { TestPriceProvider } from "../../../test/utils.js";
import { PriceProvider } from "../../../prices/provider.js";
import { Logger } from "pino";
import { Database } from "../../../database/index.js";
import { EventHandlerArgs } from "chainsauce";
import { Indexer } from "../.././indexer.js";
import { Address as ChecksumAddress, Hex } from "viem";
import { Project, Round, Application } from "../../../database/schema.js";
import { parseAddress } from "../../../address.js";
import { PublicClient } from "viem";

const addressZero =
  "0x0000000000000000000000000000000000000000" as ChecksumAddress;
const addressOne =
  "0x0000000000000000000000000000000000000001" as ChecksumAddress;
const addressTwo =
  "0x0000000000000000000000000000000000000002" as ChecksumAddress;
const addressThree =
  "0x0000000000000000000000000000000000000003" as ChecksumAddress;
const addressFour =
  "0x0000000000000000000000000000000000000004" as ChecksumAddress;
const addressFive =
  "0x0000000000000000000000000000000000000005" as ChecksumAddress;

const MOCK_PRICE_PROVIDER = new TestPriceProvider() as unknown as PriceProvider;

// eslint-disable-next-line @typescript-eslint/require-await
async function MOCK_IPFS_GET<TReturn>(cid: string) {
  switch (cid) {
    case "project-cid":
      return {
        title: "my project",
        description: "my project description",
      } as TReturn;

    case "program-cid":
      return {
        name: "my program",
      } as TReturn;

    case "round-cid":
      return {
        name: "my round",
      } as TReturn;

    default:
      throw new Error(`unexpected cid: ${cid}`);
  }
}

function MOCK_RPC_CLIENT() {
  return {
    getTransaction: vi
      .fn()
      .mockResolvedValue({ blockNumber: 1n, from: addressTwo }),
  } as unknown as PublicClient;
}

const MOCK_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

const MOCK_DB = {
  query: vi.fn(),
} as unknown as Database;

const MOCK_READ_CONTRACT: EventHandlerArgs<Indexer>["readContract"] = vi.fn();

const MOCK_SUBSCRIBE_TO_CONTRACT: EventHandlerArgs<Indexer>["subscribeToContract"] =
  vi.fn();

const MOCK_UNSUBSCRIBE_FROM_CONTRACT: EventHandlerArgs<Indexer>["unsubscribeFromContract"] =
  vi.fn();

const DEFAULT_ARGS = {
  chainId: 1,
  event: {
    name: null,
    blockNumber: 1n,
    logIndex: 0,
    transactionHash: "0x" as Hex,
    address: addressOne,
    topic: "0x" as Hex,
    params: {},
  },
  subscribeToContract: MOCK_SUBSCRIBE_TO_CONTRACT,
  unsubscribeFromContract: MOCK_UNSUBSCRIBE_FROM_CONTRACT,
  readContract: MOCK_READ_CONTRACT,
  getBlock: vi.fn().mockResolvedValue({ timestamp: 0 }),
  context: {
    priceProvider: MOCK_PRICE_PROVIDER,
    ipfsGet: MOCK_IPFS_GET,
    chainId: 1,
    logger: MOCK_LOGGER,
    db: MOCK_DB,
    rpcClient: MOCK_RPC_CLIENT(),
  },
};

describe("handleEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("ProjectCreated", () => {
    test("should insert project", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV1/ProjectRegistry/V2",
          name: "ProjectCreated",
          params: {
            projectID: 1n,
            owner: addressTwo,
          },
        },
        context: {
          ...DEFAULT_ARGS.context,
          rpcClient: MOCK_RPC_CLIENT(),
        },
      });

      expect(changesets).toHaveLength(2);

      expect(changesets[0]).toEqual({
        type: "InsertProject",
        project: {
          chainId: 1,
          createdByAddress: addressTwo,
          createdAtBlock: 1n,
          updatedAtBlock: 1n,
          id: "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
          name: "",
          metadata: null,
          metadataCid: null,
          projectNumber: 1,
          registryAddress: addressOne,
          tags: ["allo-v1"],
          projectType: "canonical",
        },
      });

      expect(changesets[1]).toEqual({
        type: "InsertProjectRole",
        projectRole: {
          chainId: 1,
          projectId:
            "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
          address: addressTwo,
          role: "owner",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("MetadataUpdated", () => {
    test("should fetch and update metadata", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV1/ProjectRegistry/V2",
          name: "MetadataUpdated",
          params: {
            projectID: 1n,
            metaPtr: {
              pointer: "project-cid",
              protocol: 0n,
            },
          },
        },
      });

      expect(changesets).toHaveLength(1);
      expect(changesets[0]).toEqual({
        type: "UpdateProject",
        chainId: 1,
        projectId:
          "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
        project: {
          metadataCid: "project-cid",
          name: "my project",
          metadata: {
            type: "project",
            title: "my project",
            description: "my project description",
          },
        },
      });
    });
  });

  describe("OwnerAdded", () => {
    test("should add owner", async () => {
      const project: Project = {
        id: "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
        name: "Project 1",
        tags: ["allo-v1"],
        chainId: 1,
        nonce: null,
        anchorAddress: null,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        projectType: "canonical",
      };

      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changes = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV1/ProjectRegistry/V2",
          name: "OwnerAdded",
          params: {
            projectID: 1n,
            owner: addressThree,
          },
        },
      });

      expect(changes).toHaveLength(1);

      expect(changes[0]).toEqual({
        type: "InsertProjectRole",
        projectRole: {
          chainId: 1,
          projectId:
            "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
          address: addressThree,
          role: "owner",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("OwnerRemoved", () => {
    test("should remove owner", async () => {
      const project: Project = {
        id: "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
        name: "Project 1",
        tags: ["allo-v1"],
        chainId: 1,
        nonce: null,
        anchorAddress: null,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        projectType: "canonical",
      };

      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changes = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV1/ProjectRegistry/V2",
          name: "OwnerRemoved",
          params: {
            projectID: 1n,
            owner: addressTwo,
          },
        },
      });

      expect(changes).toHaveLength(1);

      expect(changes[0]).toEqual({
        type: "DeleteAllProjectRolesByRoleAndAddress",
        projectRole: {
          chainId: 1,
          projectId:
            "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
          role: "owner",
          address: addressTwo,
        },
      });
    });
  });

  describe("ProgramCreated", () => {
    test("should insert a project tagged as program", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        readContract: vi
          .fn()
          .mockResolvedValue([
            1n,
            "program-cid",
          ]) as unknown as EventHandlerArgs<Indexer>["readContract"],
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV1/ProgramFactory/V1",
          name: "ProgramCreated",
          params: {
            programContractAddress: addressFour,
            programImplementation: addressFive,
          },
        },
        context: {
          ...DEFAULT_ARGS.context,
          rpcClient: MOCK_RPC_CLIENT(),
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertProject",
        project: {
          chainId: 1,
          createdByAddress: addressTwo,
          createdAtBlock: 1n,
          updatedAtBlock: 1n,
          id: addressFour,
          name: "my program",
          metadata: {
            name: "my program",
            type: "program",
          },
          metadataCid: "program-cid",
          projectNumber: null,
          registryAddress: addressZero,
          tags: ["allo-v1", "program"],
          projectType: "canonical",
        },
      });
    });
  });

  describe("Allo V1 Program: RoleGranted", () => {
    test("should add an owner project role", async () => {
      const project: Project = {
        id: addressFour,
        name: "",
        tags: ["allo-v1"],
        chainId: 1,
        nonce: null,
        anchorAddress: null,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        projectType: "canonical",
      };
      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/ProgramImplementation/V1",
          name: "RoleGranted",
          params: {
            role: "0x0000000000000000000000000000000000000000000000000000000000000000",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertProjectRole",
        projectRole: {
          chainId: 1,
          projectId: addressFour,
          address: addressTwo,
          role: "owner",
          createdAtBlock: 1n,
        },
      });
    });

    test("should add a member project role", async () => {
      const project: Project = {
        id: addressFour,
        name: "",
        tags: ["allo-v2"],
        chainId: 1,
        nonce: null,
        anchorAddress: null,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        projectType: "canonical",
      };
      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/ProgramImplementation/V1",
          name: "RoleGranted",
          params: {
            role: "0xaa630204f2780b6f080cc77cc0e9c0a5c21e92eb0c6771e709255dd27d6de132",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertProjectRole",
        projectRole: {
          chainId: 1,
          projectId: addressFour,
          address: addressTwo,
          role: "member",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("Allo V1 Program: RoleRevoked", () => {
    test("should remove the owner project role", async () => {
      const project: Project = {
        id: addressFour,
        name: "",
        tags: ["allo-v2"],
        chainId: 1,
        nonce: null,
        anchorAddress: null,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        projectType: "canonical",
      };
      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/ProgramImplementation/V1",
          name: "RoleRevoked",
          params: {
            role: "0x0000000000000000000000000000000000000000000000000000000000000000",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "DeleteAllProjectRolesByRoleAndAddress",
        projectRole: {
          chainId: 1,
          projectId: addressFour,
          address: addressTwo,
          role: "owner",
        },
      });
    });

    test("should remove the member project role", async () => {
      const project: Project = {
        id: addressFour,
        name: "",
        tags: ["allo-v2"],
        chainId: 1,
        nonce: null,
        anchorAddress: null,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        projectType: "canonical",
      };
      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/ProgramImplementation/V1",
          name: "RoleRevoked",
          params: {
            role: "0xaa630204f2780b6f080cc77cc0e9c0a5c21e92eb0c6771e709255dd27d6de132",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "DeleteAllProjectRolesByRoleAndAddress",
        projectRole: {
          chainId: 1,
          projectId: addressFour,
          address: addressTwo,
          role: "member",
        },
      });
    });
  });

  describe("Allo V1 RoundImplementationV1: RoleGranted", () => {
    test("should add an owner project role", async () => {
      const round: Round = {
        id: parseAddress(addressFour),
        chainId: 1,
        matchAmount: 0n,
        matchTokenAddress: parseAddress(addressZero),
        matchAmountInUsd: 0,
        fundedAmount: 0n,
        fundedAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: null,
        roundMetadataCid: "",
        roundMetadata: {},
        applicationsStartTime: null,
        applicationsEndTime: null,
        donationsStartTime: null,
        donationsEndTime: null,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 2n,
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        tags: [],
        managerRole: "",
        adminRole: "",
        strategyAddress: parseAddress(addressZero),
        strategyId: "",
        strategyName: "",
        readyForPayoutTransaction: null,
        matchingDistribution: null,
        projectId: parseAddress(addressZero),
      };
      MOCK_DB.getRoundById = vi.fn().mockResolvedValueOnce(round);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V1",
          name: "RoleGranted",
          params: {
            role: "0x0000000000000000000000000000000000000000000000000000000000000000",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertRoundRole",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "admin",
          createdAtBlock: 1n,
        },
      });
    });

    test("should add a member project role", async () => {
      const round: Round = {
        id: parseAddress(addressFour),
        chainId: 1,
        matchAmount: 0n,
        matchTokenAddress: parseAddress(addressZero),
        matchAmountInUsd: 0,
        fundedAmount: 0n,
        fundedAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: null,
        roundMetadataCid: "",
        roundMetadata: {},
        applicationsStartTime: null,
        applicationsEndTime: null,
        donationsStartTime: null,
        donationsEndTime: null,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 2n,
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        tags: [],
        managerRole: "",
        adminRole: "",
        strategyAddress: parseAddress(addressZero),
        strategyId: "",
        strategyName: "",
        readyForPayoutTransaction: null,
        matchingDistribution: null,
        projectId: parseAddress(addressZero),
      };
      MOCK_DB.getRoundById = vi.fn().mockResolvedValueOnce(round);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V1",
          name: "RoleGranted",
          params: {
            role: "0xec61da14b5abbac5c5fda6f1d57642a264ebd5d0674f35852829746dfb8174a5",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertRoundRole",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "manager",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("Allo V1 RoundImplementationV2: RoleGranted", () => {
    test("should add an owner project role", async () => {
      const round: Round = {
        id: parseAddress(addressFour),
        chainId: 1,
        matchAmount: 0n,
        matchTokenAddress: parseAddress(addressZero),
        matchAmountInUsd: 0,
        fundedAmount: 0n,
        fundedAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: null,
        roundMetadataCid: "",
        roundMetadata: {},
        applicationsStartTime: null,
        applicationsEndTime: null,
        donationsStartTime: null,
        donationsEndTime: null,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 2n,
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        tags: [],
        managerRole: "",
        adminRole: "",
        strategyAddress: parseAddress(addressZero),
        strategyId: "",
        strategyName: "",
        readyForPayoutTransaction: null,
        matchingDistribution: null,
        projectId: parseAddress(addressZero),
      };
      MOCK_DB.getRoundById = vi.fn().mockResolvedValueOnce(round);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V2",
          name: "RoleGranted",
          params: {
            role: "0x0000000000000000000000000000000000000000000000000000000000000000",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertRoundRole",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "admin",
          createdAtBlock: 1n,
        },
      });
    });

    test("should add a member project role", async () => {
      const round: Round = {
        id: parseAddress(addressFour),
        chainId: 1,
        matchAmount: 0n,
        matchTokenAddress: parseAddress(addressZero),
        matchAmountInUsd: 0,
        fundedAmount: 0n,
        fundedAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: null,
        roundMetadataCid: "",
        roundMetadata: {},
        applicationsStartTime: null,
        applicationsEndTime: null,
        donationsStartTime: null,
        donationsEndTime: null,
        createdByAddress: parseAddress(addressTwo),
        createdAtBlock: 1n,
        updatedAtBlock: 2n,
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        tags: [],
        managerRole: "",
        adminRole: "",
        strategyAddress: parseAddress(addressZero),
        strategyId: "",
        strategyName: "",
        readyForPayoutTransaction: null,
        matchingDistribution: null,
        projectId: parseAddress(addressZero),
      };
      MOCK_DB.getRoundById = vi.fn().mockResolvedValueOnce(round);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V2",
          name: "RoleGranted",
          params: {
            role: "0xec61da14b5abbac5c5fda6f1d57642a264ebd5d0674f35852829746dfb8174a5",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertRoundRole",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "manager",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("Allo V1 RoundImplementationV1: RoleRevoked", () => {
    test("should remove an owner project role", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V1",
          name: "RoleRevoked",
          params: {
            role: "0x0000000000000000000000000000000000000000000000000000000000000000",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "DeleteAllRoundRolesByRoleAndAddress",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "admin",
        },
      });
    });

    test("should remove a manager project role", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V1",
          name: "RoleRevoked",
          params: {
            role: "0xec61da14b5abbac5c5fda6f1d57642a264ebd5d0674f35852829746dfb8174a5",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "DeleteAllRoundRolesByRoleAndAddress",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "manager",
        },
      });
    });
  });

  describe("Allo V1 RoundImplementationV2: RoleRevoked", () => {
    test("should remove an owner project role", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V2",
          name: "RoleRevoked",
          params: {
            role: "0x0000000000000000000000000000000000000000000000000000000000000000",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "DeleteAllRoundRolesByRoleAndAddress",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "admin",
        },
      });
    });

    test("should remove a manager project role", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundImplementation/V2",
          name: "RoleRevoked",
          params: {
            role: "0xec61da14b5abbac5c5fda6f1d57642a264ebd5d0674f35852829746dfb8174a5",
            account: addressTwo,
            sender: addressThree,
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "DeleteAllRoundRolesByRoleAndAddress",
        roundRole: {
          chainId: 1,
          roundId: addressFour,
          address: addressTwo,
          role: "manager",
        },
      });
    });
  });

  describe("RoundCreated", () => {
    test("should insert a new round", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        readContract: vi.fn().mockImplementation(({ functionName }) => {
          switch (functionName) {
            case "matchAmount":
              return 0n;
            case "roundMetaPtr":
              return [0, "round-cid"];
            case "applicationMetaPtr":
              return [0, "round-cid"];
            case "token":
              return addressZero;
            default:
              return undefined;
          }
        }),
        event: {
          ...DEFAULT_ARGS.event,
          address: addressFour,
          contractName: "AlloV1/RoundFactory/V2",
          name: "RoundCreated",
          params: {
            roundAddress: addressTwo,
            ownedBy: addressThree,
            roundImplementation: addressZero,
          },
        },
        context: {
          ...DEFAULT_ARGS.context,
          rpcClient: MOCK_RPC_CLIENT(),
        },
      });

      expect(changesets).toHaveLength(2);

      expect(changesets[0]).toEqual({
        type: "InsertRound",
        round: {
          chainId: 1,
          id: "0x0000000000000000000000000000000000000002",
          tags: ["allo-v1"],
          totalDonationsCount: 0,
          totalAmountDonatedInUsd: 0,
          fundedAmount: 0n,
          fundedAmountInUsd: 0,
          uniqueDonorsCount: 0,
          matchTokenAddress: "0x0000000000000000000000000000000000000000",
          matchAmount: 0n,
          matchAmountInUsd: 0,
          applicationMetadataCid: "round-cid",
          applicationMetadata: { name: "my round" },
          roundMetadataCid: "round-cid",
          roundMetadata: { name: "my round" },
          applicationsStartTime: null,
          applicationsEndTime: null,
          donationsStartTime: null,
          donationsEndTime: null,
          managerRole: "",
          adminRole: "",
          createdByAddress: parseAddress(addressTwo),
          createdAtBlock: 1n,
          updatedAtBlock: 1n,
          strategyAddress: parseAddress(addressZero),
          strategyId: "",
          strategyName: "",
          projectId: addressThree,
        },
      });

      expect(changesets[1]).toEqual({
        type: "UpdateRound",
        roundId: addressTwo,
        chainId: 1,
        round: { updatedAtBlock: 1n, matchAmount: 0n, matchAmountInUsd: 0 },
      });
    });
  });

  describe("FundsDistributed", () => {
    test("should set distributionTransaction in application", async () => {
      const roundId = parseAddress(addressFour);
      const payoutAddress = addressFour;

      const application: Application = {
        id: "app-id",
        chainId: 1,
        roundId: roundId,
        projectId: "0x1234",
        anchorAddress: parseAddress(addressZero),
        status: "PENDING",
        statusSnapshots: [],
        distributionTransaction: null,
        metadataCid: null,
        metadata: null,
        createdByAddress: parseAddress(addressZero),
        createdAtBlock: 0n,
        statusUpdatedAtBlock: 0n,
        totalDonationsCount: 0,
        totalAmountDonatedInUsd: 0,
        uniqueDonorsCount: 0,
        tags: [],
      };

      MOCK_DB.getApplicationByProjectId = vi
        .fn()
        .mockResolvedValueOnce(application);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          address: payoutAddress,
          contractName: "AlloV1/MerklePayoutStrategyImplementation/V2",
          name: "FundsDistributed",
          params: {
            amount: 0n,
            grantee: addressTwo,
            token: addressZero,
            projectId: "0x1234",
          },
        },
        readContract: vi
          .fn()
          .mockImplementation(
            ({
              functionName,
              address,
            }: {
              functionName: string;
              address: string;
            }) => {
              if (functionName === "roundAddress" && address === addressFour) {
                return roundId;
              } else {
                throw new Error(
                  `read contract called with unexpected args: ${functionName}, ${address}`
                );
              }

              return "0x";
            }
          ),
        context: {
          ...DEFAULT_ARGS.context,
          rpcClient: MOCK_RPC_CLIENT(),
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "UpdateApplication",
        chainId: 1,
        roundId: roundId,
        applicationId: "app-id",
        application: {
          distributionTransaction: "0x",
        },
      });
    });
  });
});
