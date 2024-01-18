import { vi, describe, test, expect, beforeEach } from "vitest";
import { Address as ChecksumAddress, Hex } from "viem";
import { handleEvent } from "./handleEvent.js";
import { TestPriceProvider } from "../../../test/utils.js";
import { PriceProvider } from "../../../prices/provider.js";
import { Logger } from "pino";
import { Database } from "../../../database/index.js";
import { EventHandlerArgs } from "chainsauce";
import { Indexer } from "../.././indexer.js";
import { Project, PendingProjectRole } from "../../../database/schema.js";
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
            id: "0x0001",
            metadata: {
              some: "metadata",
            },
            metadataCid: "CID-1",
            projectNumber: 0,
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

        expect(changesets).toHaveLength(4);

        expect(changesets[0]).toEqual({
          type: "InsertProject",
          project: {
            chainId: 1,
            name: "Project 1",
            createdAtBlock: 1n,
            id: "0x0001",
            metadata: {
              some: "metadata",
            },
            metadataCid: "CID-1",
            projectNumber: 0,
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
          projectNumber: 1,
          createdAtBlock: 1n,
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
        projectNumber: 1,
        createdAtBlock: 1n,
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
});
