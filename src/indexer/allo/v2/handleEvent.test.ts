import { vi, describe, test, expect, beforeEach } from "vitest";
import { Address as ChecksumAddress, Hex } from "viem";
import { handleEvent } from "./handleEvent.js";
import { TestPriceProvider } from "../../../test/utils.js";
import { PriceProvider } from "../../../prices/provider.js";
import { Logger } from "pino";
import { Database } from "../../../database/index.js";
import { EventHandlerArgs } from "chainsauce";
import { Indexer } from "../.././indexer.js";
import {
  Project,
  PendingProjectRole,
  Round,
} from "../../../database/schema.js";
import { parseAddress } from "../../../address.js";

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

const MOCK_PRICE_PROVIDER = new TestPriceProvider() as unknown as PriceProvider;

function MOCK_IPFS_GET<TReturn>(_arg: string) {
  return Promise.resolve({ some: "metadata" } as TReturn);
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
  context: {
    priceProvider: MOCK_PRICE_PROVIDER,
    ipfsGet: MOCK_IPFS_GET,
    chainId: 1,
    logger: MOCK_LOGGER,
    db: MOCK_DB,
  },
};

describe("handleEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("ProfileCreated", () => {
    describe("without any pending project role", () => {
      test("should insert project", async () => {
        MOCK_DB.getPendingProjectRolesByRole = vi
          .fn()
          .mockResolvedValueOnce([]);

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Registry/V1",
            name: "ProfileCreated",
            params: {
              profileId: "0x0001",
              owner: addressTwo,
              nonce: 1n,
              name: "Project 1",
              metadata: {
                protocol: 1n,
                pointer: "CID-1",
              },
              anchor: addressThree,
            },
          },
        });

        expect(changesets).toHaveLength(2);

        expect(changesets[0]).toEqual({
          type: "InsertProject",
          project: {
            chainId: 1,
            name: "Project 1",
            createdAtBlock: 1n,
            updatedAtBlock: 1n,
            id: "0x0001",
            metadata: {
              some: "metadata",
            },
            metadataCid: "CID-1",
            projectNumber: null,
            registryAddress: addressOne,
            tags: ["allo-v2"],
          },
        });

        expect(changesets[1]).toEqual({
          type: "InsertProjectRole",
          projectRole: {
            chainId: 1,
            projectId: "0x0001",
            address: addressTwo,
            role: "owner",
            createdAtBlock: 1n,
          },
        });
      });
    });

    describe("with two pending project roles", () => {
      test("should insert project", async () => {
        const pendingProjectRoles: PendingProjectRole[] = [
          {
            id: 1,
            chainId: 1,
            role: "0x0001",
            address: parseAddress(addressThree),
            createdAtBlock: 1n,
          },
          {
            id: 2,
            chainId: 1,
            role: "0x0001",
            address: parseAddress(addressFour),
            createdAtBlock: 1n,
          },
        ];
        MOCK_DB.getPendingProjectRolesByRole = vi
          .fn()
          .mockResolvedValueOnce(pendingProjectRoles);

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Registry/V1",
            name: "ProfileCreated",
            params: {
              profileId: "0x0001",
              owner: addressTwo,
              nonce: 1n,
              name: "Project 1",
              metadata: {
                protocol: 1n,
                pointer: "CID-1",
              },
              anchor: addressThree,
            },
          },
        });

        expect(changesets).toHaveLength(5);

        expect(changesets[0]).toEqual({
          type: "InsertProject",
          project: {
            chainId: 1,
            name: "Project 1",
            createdAtBlock: 1n,
            updatedAtBlock: 1n,
            id: "0x0001",
            metadata: {
              some: "metadata",
            },
            metadataCid: "CID-1",
            projectNumber: null,
            registryAddress: addressOne,
            tags: ["allo-v2"],
          },
        });

        expect(changesets[1]).toEqual({
          type: "InsertProjectRole",
          projectRole: {
            chainId: 1,
            projectId: "0x0001",
            address: addressTwo,
            role: "owner",
            createdAtBlock: 1n,
          },
        });

        expect(changesets[2]).toEqual({
          type: "InsertProjectRole",
          projectRole: {
            chainId: 1,
            projectId: "0x0001",
            address: addressThree,
            role: "member",
            createdAtBlock: 1n,
          },
        });

        expect(changesets[3]).toEqual({
          type: "InsertProjectRole",
          projectRole: {
            chainId: 1,
            projectId: "0x0001",
            address: addressFour,
            role: "member",
            createdAtBlock: 1n,
          },
        });

        expect(changesets[4]).toEqual({
          type: "DeletePendingProjectRoles",
          ids: [1, 2],
        });
      });
    });
  });

  describe("ProfileNameUpdated", () => {
    test("should update project's name", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV2/Registry/V1",
          name: "ProfileNameUpdated",
          params: {
            profileId: "0x0001",
            name: "New Name",
            anchor: addressZero,
          },
        },
      });

      expect(changesets).toHaveLength(1);
      expect(changesets[0]).toEqual({
        type: "UpdateProject",
        chainId: 1,
        projectId: "0x0001",
        project: {
          name: "New Name",
        },
      });
    });
  });

  describe("ProfileMetadataUpdated", () => {
    test("should fetch and update metadata", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV2/Registry/V1",
          name: "ProfileMetadataUpdated",
          params: {
            profileId: "0x0001",
            metadata: {
              pointer: "CID-1",
              protocol: 0n,
            },
          },
        },
      });

      expect(changesets).toHaveLength(1);
      expect(changesets[0]).toEqual({
        type: "UpdateProject",
        chainId: 1,
        projectId: "0x0001",
        project: {
          metadataCid: "CID-1",
          metadata: { some: "metadata" },
        },
      });
    });
  });

  describe("ProfileOwnerUpdated", () => {
    test("should update the project's owner", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV2/Registry/V1",
          name: "ProfileOwnerUpdated",
          params: {
            profileId: "0x0001",
            owner: addressFour,
          },
        },
      });

      expect(changesets).toHaveLength(2);

      expect(changesets[0]).toEqual({
        type: "DeleteAllProjectRolesByRole",
        projectRole: {
          chainId: 1,
          projectId: "0x0001",
          role: "owner",
        },
      });

      expect(changesets[1]).toEqual({
        type: "InsertProjectRole",
        projectRole: {
          chainId: 1,
          projectId: "0x0001",
          address: addressFour,
          role: "owner",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("Registry: RoleGranted", () => {
    describe("existing project", () => {
      test("should add a new member project role", async () => {
        const project: Project = {
          id: "0x0001",
          name: "",
          tags: ["allo-v2"],
          chainId: 1,
          metadata: null,
          metadataCid: null,
          registryAddress: parseAddress(addressZero),
          projectNumber: null,
          createdAtBlock: 1n,
          updatedAtBlock: 1n,
        };
        MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Registry/V1",
            name: "RoleGranted",
            params: {
              role: "0x0001",
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
            projectId: "0x0001",
            address: addressTwo,
            role: "member",
            createdAtBlock: 1n,
          },
        });
      });
    });

    describe("non existing project", () => {
      test("should add a new pending member role", async () => {
        MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(null);

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Registry/V1",
            name: "RoleGranted",
            params: {
              role: "0x0001",
              account: addressTwo,
              sender: addressThree,
            },
          },
        });

        expect(changesets).toHaveLength(1);
        expect(changesets[0]).toEqual({
          type: "InsertPendingProjectRole",
          pendingProjectRole: {
            chainId: 1,
            role: "0x0001",
            address: addressTwo,
            createdAtBlock: 1n,
          },
        });
      });
    });
  });

  describe("Registry: RoleRevoked", () => {
    test("should remove member project role", async () => {
      const project: Project = {
        id: "0x0001",
        name: "",
        tags: ["allo-v2"],
        chainId: 1,
        metadata: null,
        metadataCid: null,
        registryAddress: parseAddress(addressZero),
        projectNumber: null,
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
      };
      MOCK_DB.getProjectById = vi.fn().mockResolvedValueOnce(project);

      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName: "AlloV2/Registry/V1",
          name: "RoleRevoked",
          params: {
            role: "0x0001",
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
          projectId: "0x0001",
          address: addressTwo,
          role: "member",
        },
      });
    });
  });

  describe("PoolCreated", () => {
    test("should insert a new round", async () => {
      const changesets = await handleEvent({
        ...DEFAULT_ARGS,
        readContract: vi.fn().mockImplementation(({ functionName }) => {
          switch (functionName) {
            case "getStrategyId":
              return "0x6f9291df02b2664139cec5703c124e4ebce32879c74b6297faa1468aa5ff9ebf";
            case "roundMetaPtr":
              return [0, "test-cid"];
            case "applicationMetaPtr":
              return [0, "test-cid"];
            case "token":
              return addressZero;
            default:
              return undefined;
          }
        }),
        context: {
          ...DEFAULT_ARGS.context,
          ipfsGet: <T>(_arg: string) => {
            return Promise.resolve({
              round: { roundMetadata: "round metadata" },
              application: { applicationMetadata: "application metadata" },
            } as T);
          },
        },
        event: {
          ...DEFAULT_ARGS.event,
          address: addressOne,
          contractName: "AlloV2/Allo/V1",
          name: "PoolCreated",
          params: {
            poolId: 1n,
            profileId: "0x0002",
            strategy: addressTwo,
            token: addressZero,
            amount: 10n,
            metadata: {
              protocol: 1n,
              pointer: "test-cid",
            },
          },
        },
      });

      expect(changesets).toHaveLength(1);

      expect(changesets[0]).toEqual({
        type: "InsertRound",
        round: {
          chainId: 1,
          id: "1",
          tags: ["allo-v2"],
          totalDonationsCount: 0,
          totalAmountDonatedInUsd: 0,
          uniqueDonorsCount: 0,
          matchTokenAddress: "0x0000000000000000000000000000000000000000",
          matchAmount: 10n,
          matchAmountInUsd: 0,
          applicationMetadataCid: "test-cid",
          applicationMetadata: { applicationMetadata: "application metadata" },
          roundMetadataCid: "test-cid",
          roundMetadata: { roundMetadata: "round metadata" },
          applicationsStartTime: null,
          applicationsEndTime: null,
          donationsStartTime: null,
          donationsEndTime: null,
          managerRole:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          adminRole:
            "0xd866368887d58dbdd097c420fb7ec3bf9a28071e2c715e21155ba472632c67b1",
          createdAtBlock: 1n,
          updatedAtBlock: 1n,
          strategyAddress: parseAddress(addressTwo),
          strategyId:
            "0x6f9291df02b2664139cec5703c124e4ebce32879c74b6297faa1468aa5ff9ebf",
          strategyName:
            "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
        },
      });
    });
  });

  describe("Pool: RoleGranted", () => {
    describe("when round doesn't exist yet", () => {
      test("should create a round pending role", async () => {
        MOCK_DB.getRoundByRole = vi.fn().mockResolvedValue(null);

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Allo/V1",
            name: "RoleGranted",
            params: {
              role: "0x01",
              account: addressTwo,
              sender: addressThree,
            },
          },
        });

        expect(changesets).toHaveLength(1);
        expect(changesets[0]).toEqual({
          type: "InsertPendingRoundRole",
          pendingRoundRole: {
            chainId: 1,
            role: "0x01",
            address: addressTwo,
            createdAtBlock: 1n,
          },
        });
      });
    });

    describe("when round already exists", () => {
      const round: Round = {
        id: "0x01",
        chainId: 1,
        matchAmount: 0n,
        matchTokenAddress: parseAddress(addressZero),
        matchAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: null,
        roundMetadataCid: "",
        roundMetadata: {},
        applicationsStartTime: new Date(),
        applicationsEndTime: new Date(),
        donationsStartTime: new Date(),
        donationsEndTime: new Date(),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        managerRole: "0x01",
        adminRole: "0x9999",
        tags: [],
        strategyAddress: parseAddress(addressZero),
        strategyId: "",
        strategyName: "",
      };

      test("should create a round manager role", async () => {
        MOCK_DB.getRoundByRole = vi
          .fn()
          .mockImplementation(async (_chainId, roleName, _roleValue) => {
            if (roleName === "manager") {
              return round;
            }

            return null;
          });

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Allo/V1",
            name: "RoleGranted",
            params: {
              role: "0x01",
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
            roundId: "0x01",
            address: addressTwo,
            role: "manager",
            createdAtBlock: 1n,
          },
        });
      });

      test("should create a round admin role", async () => {
        MOCK_DB.getRoundByRole = vi
          .fn()
          .mockImplementation(async (_chainId, roleName, _roleValue) => {
            if (roleName === "admin") {
              return round;
            }

            return null;
          });

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Allo/V1",
            name: "RoleGranted",
            params: {
              role: "0x01",
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
            roundId: "0x01",
            address: addressTwo,
            role: "admin",
            createdAtBlock: 1n,
          },
        });
      });
    });
  });

  describe("Pool: RoleRevoked", () => {
    describe("when a round with the revoked role doesn't exist", () => {
      test("should return an empty changeset", async () => {
        MOCK_DB.getRoundByRole = vi.fn().mockResolvedValue(null);

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Allo/V1",
            name: "RoleRevoked",
            params: {
              role: "0x01",
              account: addressTwo,
              sender: addressThree,
            },
          },
        });

        expect(changesets).toHaveLength(0);
      });
    });

    describe("when round already exists", () => {
      const round: Round = {
        id: "0x01",
        chainId: 1,
        matchAmount: 0n,
        matchTokenAddress: parseAddress(addressZero),
        matchAmountInUsd: 0,
        applicationMetadataCid: "",
        applicationMetadata: null,
        roundMetadataCid: "",
        roundMetadata: {},
        applicationsStartTime: new Date(),
        applicationsEndTime: new Date(),
        donationsStartTime: new Date(),
        donationsEndTime: new Date(),
        createdAtBlock: 1n,
        updatedAtBlock: 1n,
        totalAmountDonatedInUsd: 0,
        totalDonationsCount: 0,
        uniqueDonorsCount: 0,
        managerRole: "0x01",
        adminRole: "0x9999",
        tags: [],
        strategyAddress: parseAddress(addressZero),
        strategyId: "",
        strategyName: "",
      };

      test("should delete a round manager role", async () => {
        MOCK_DB.getRoundByRole = vi
          .fn()
          .mockImplementation(async (_chainId, roleName, _roleValue) => {
            if (roleName === "manager") {
              return round;
            }

            return null;
          });

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Allo/V1",
            name: "RoleRevoked",
            params: {
              role: "0x01",
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
            roundId: "0x01",
            role: "manager",
            address: addressTwo,
          },
        });
      });

      test("should delete a round admin role", async () => {
        MOCK_DB.getRoundByRole = vi
          .fn()
          .mockImplementation(async (_chainId, roleName, _roleValue) => {
            if (roleName === "admin") {
              return round;
            }

            return null;
          });

        const changesets = await handleEvent({
          ...DEFAULT_ARGS,
          event: {
            ...DEFAULT_ARGS.event,
            contractName: "AlloV2/Allo/V1",
            name: "RoleRevoked",
            params: {
              role: "0x01",
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
            roundId: "0x01",
            role: "admin",
            address: addressTwo,
          },
        });
      });
    });
  });
});
