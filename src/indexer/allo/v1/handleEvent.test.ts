import { vi, describe, test, expect, beforeEach } from "vitest";
import { handleEvent } from "./handleEvent.js";
import { TestPriceProvider } from "../../../test/utils.js";
import { PriceProvider } from "../../../prices/provider.js";
import { Logger } from "pino";
import { Database } from "../../../database/index.js";
import { EventHandlerArgs } from "chainsauce";
import { Indexer } from "../.././indexer.js";
import { Address as ChecksumAddress, Hex } from "viem";
import { Project } from "../../../database/schema.js";
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
      });

      expect(changesets).toHaveLength(2);

      expect(changesets[0]).toEqual({
        type: "InsertProject",
        project: {
          chainId: 1,
          createdAtBlock: 1n,
          id: "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
          name: "",
          metadata: null,
          metadataCid: null,
          ownerAddresses: [addressTwo],
          projectNumber: 1,
          registryAddress: addressOne,
          tags: ["allo-v1"],
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
              pointer: "metadatacid",
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
          metadataCid: "metadatacid",
          metadata: { some: "metadata" },
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
        metadata: null,
        metadataCid: null,
        ownerAddresses: [parseAddress(addressTwo)],
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdAtBlock: 1n,
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
            owner: addressFour,
          },
        },
      });

      expect(changes).toHaveLength(2);

      expect(changes[0]).toEqual({
        type: "UpdateProject",
        chainId: 1,
        projectId:
          "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
        project: {
          ownerAddresses: [parseAddress(addressTwo), parseAddress(addressFour)],
        },
      });

      expect(changes[1]).toEqual({
        type: "InsertProjectRole",
        projectRole: {
          chainId: 1,
          projectId:
            "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
          address: addressFour,
          role: "owner",
          createdAtBlock: 1n,
        },
      });
    });
  });

  describe("OwnerRemoved", () => {
    test("should add owner", async () => {
      const project: Project = {
        id: "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
        name: "Project 1",
        tags: ["allo-v1"],
        chainId: 1,
        metadata: null,
        metadataCid: null,
        ownerAddresses: [parseAddress(addressTwo), parseAddress(addressFour)],
        registryAddress: parseAddress(addressZero),
        projectNumber: 1,
        createdAtBlock: 1n,
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

      expect(changes).toHaveLength(2);

      expect(changes[0]).toEqual({
        type: "UpdateProject",
        chainId: 1,
        projectId:
          "0xe31382b762a33e568e1e9ef38d64f4a2b4dbb51ec0f79ec41779fc5be79ead32",
        project: {
          ownerAddresses: [parseAddress(addressFour)],
        },
      });

      expect(changes[1]).toEqual({
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
});