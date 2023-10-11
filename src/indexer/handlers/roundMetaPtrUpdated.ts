import { Database } from "chainsauce";
import { Round } from "../types.js";
import { RoundMetaPtrUpdatedEvent } from "../events.js";
import { ethers } from "ethers";

export default async function roundMetaPtrUpdated(
  event: RoundMetaPtrUpdatedEvent,
  deps: {
    ipfsGet: <T>(cid: string) => Promise<T | undefined>;
    db: Database;
  }
) {
  const { db, ipfsGet } = deps;
  const id = ethers.utils.getAddress(event.address);

  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["metadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      metadata: metadata ?? null,
      metaPtr: event.params.newMetaPtr.pointer,
    };
  });
}
