import { describe, test, expect, vitest } from "vitest";
import { default as roundMetaPtrUpdated } from "./roundMetaPtrUpdated.js";

describe("roundMetaPtrUpdated", () => {
  test("reads metadata from ipfs and updates local database", async () => {
    const data = {
      rounds: [
        {
          id: "rnd-abc",
          amountUSD: 123,
          votes: 1,
          metaPtr: "oldMetaPtr123",
          metadata: {
            name: "FooRound",
          },
        },
      ],
    };
    const mockDb = {
      collection(collectionName: string) {
        return {
          updateById(id: string, updateFn: (oldData: any) => any) {
            const collection = data[collectionName];
            const recordIndex = collection.findIndex((c) => c.id === id);
            const oldData = collection[recordIndex];
            collection[recordIndex] = updateFn(oldData);
          },
        };
      },
    };
    const mockIpfsGet = vitest.fn().mockResolvedValue({
      name: "BarRound",
    });

    const metaPtr = "newMetaPtr123";
    await roundMetaPtrUpdated(
      {
        name: "RoundMetaPtrUpdated",
        address: "rnd-abc",
        args: {
          newMetaPtr: { pointer: metaPtr },
        },
      },
      { db: mockDb, ipfsGet: mockIpfsGet }
    );

    expect(mockIpfsGet).toHaveBeenCalledWith(metaPtr);
    expect(data).toEqual({
      rounds: [
        {
          id: "rnd-abc",
          amountUSD: 123,
          votes: 1,
          metaPtr: "newMetaPtr123",
          metadata: {
            name: "BarRound",
          },
        },
      ],
    });
  });
});
