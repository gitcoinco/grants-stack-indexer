import { vi, describe, test, expect, beforeEach } from "vitest";
import { Address as ChecksumAddress, Hex, PublicClient } from "viem";
import { EventHandlerArgs } from "chainsauce";
import { Logger } from "pino";
import { Database } from "#database/index.js";
import { PriceProvider } from "#prices/provider.js";
import { Indexer } from "#indexer/indexer.js";
import { getEventHandler } from "#indexer/utils/getEventHandler.js";
import { TestPriceProvider } from "#test/utils.js";

const addressOne =
  "0x0000000000000000000000000000000000000001" as ChecksumAddress;
const addressTwo =
  "0x0000000000000000000000000000000000000002" as ChecksumAddress;

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

function MOCK_BLOCK_TIMESTAMP_IN_MS() {
  return vi.fn().mockResolvedValue(0);
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
    blockTimestampInMs: MOCK_BLOCK_TIMESTAMP_IN_MS(),
  },
};

describe("handleEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("AlloV1/ProjectRegistry/V1", () => {
    test("ProjectCreated event should insert project", async () => {
      const contractName = "AlloV1/ProjectRegistry/V1";
      const eventName = "ProjectCreated";

      const args: EventHandlerArgs<Indexer> = {
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName,
          name: eventName,
          params: {
            projectID: 1n,
            owner: addressTwo,
          },
        },
        context: {
          ...DEFAULT_ARGS.context,
          rpcClient: MOCK_RPC_CLIENT(),
        },
      };

      const handler = getEventHandler(contractName, eventName);

      expect(handler).toBeDefined();
      if (!handler) return;

      const changesets = await handler(args);

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

  describe("AlloV1/ProjectCreated/V2", () => {
    test("ProjectCreated event should insert project", async () => {
      const contractName = "AlloV1/ProjectRegistry/V2";
      const eventName = "ProjectCreated";

      const args: EventHandlerArgs<Indexer> = {
        ...DEFAULT_ARGS,
        event: {
          ...DEFAULT_ARGS.event,
          contractName,
          name: eventName,
          params: {
            projectID: 1n,
            owner: addressTwo,
          },
        },
        context: {
          ...DEFAULT_ARGS.context,
          rpcClient: MOCK_RPC_CLIENT(),
        },
      };

      const handler = getEventHandler(contractName, eventName);

      expect(handler).toBeDefined();
      if (!handler) return;

      const changesets = await handler(args);

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

    test("MetadataUpdated event, NOT MIGRATED -> getEventHandler should return undefined", () => {
      const contractName = "AlloV1/ProjectRegistry/V2";
      const eventName = "MetadataUpdated";

      const handler = getEventHandler(contractName, eventName);

      expect(handler).toBeUndefined();
    });
  });

  describe("Unknown contract name", () => {
    test("getEventHandler should return undefined", () => {
      const contractName = "Unknown";
      const eventName = "ProjectCreated";

      const handler = getEventHandler(contractName, eventName);

      expect(handler).toBeUndefined();
    });
  });
});
