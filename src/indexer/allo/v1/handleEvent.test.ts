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

const zeroAddress =
  "0x0000000000000000000000000000000000000000" as ChecksumAddress;
const oneAddress =
  "0x0000000000000000000000000000000000000001" as ChecksumAddress;

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
    address: zeroAddress,
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
            owner: zeroAddress,
          },
        },
      });

      expect(changesets).toHaveLength(1);
      expect(changesets[0]).toEqual({
        type: "InsertProject",
        project: {
          chainId: 1,
          createdAtBlock: 1n,
          id: "0xd0c4b8bf41dcf0607cd6c6d5f7c6423344ce99ddaaa72c31a7d8fb332a218878",
          name: "",
          metadata: null,
          metadataCid: null,
          ownerAddresses: ["0x0000000000000000000000000000000000000000"],
          projectNumber: 1,
          registryAddress: "0x0000000000000000000000000000000000000000",
          tags: ["allo-v1"],
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
        projectId:
          "0xd0c4b8bf41dcf0607cd6c6d5f7c6423344ce99ddaaa72c31a7d8fb332a218878",
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
        id: "0xd0c4b8bf41dcf0607cd6c6d5f7c6423344ce99ddaaa72c31a7d8fb332a218878",
        name: "Project 1",
        tags: ["allo-v1"],
        chainId: 1,
        metadata: null,
        metadataCid: null,
        ownerAddresses: [parseAddress(zeroAddress)],
        registryAddress: parseAddress(zeroAddress),
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
            owner: oneAddress,
          },
        },
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: "UpdateProject",
        projectId:
          "0xd0c4b8bf41dcf0607cd6c6d5f7c6423344ce99ddaaa72c31a7d8fb332a218878",
        project: {
          ownerAddresses: [parseAddress(zeroAddress), parseAddress(oneAddress)],
        },
      });
    });
  });

  describe("OwnerRemoved", () => {
    test("should add owner", async () => {
      const project: Project = {
        id: "0xd0c4b8bf41dcf0607cd6c6d5f7c6423344ce99ddaaa72c31a7d8fb332a218878",
        name: "Project 1",
        tags: ["allo-v1"],
        chainId: 1,
        metadata: null,
        metadataCid: null,
        ownerAddresses: [parseAddress(zeroAddress), parseAddress(oneAddress)],
        registryAddress: parseAddress(zeroAddress),
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
            owner: oneAddress,
          },
        },
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: "UpdateProject",
        projectId:
          "0xd0c4b8bf41dcf0607cd6c6d5f7c6423344ce99ddaaa72c31a7d8fb332a218878",
        project: {
          ownerAddresses: [parseAddress(zeroAddress)],
        },
      });
    });
  });
});
