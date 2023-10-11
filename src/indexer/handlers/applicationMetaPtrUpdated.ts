import { Database } from "chainsauce";
import { Round } from "../types.js";
import { ApplicationMetaPtrUpdatedEvent } from "../events.js";
import { ethers } from "ethers";

export default async function applicationMetaPtrUpdated(
  event: ApplicationMetaPtrUpdatedEvent,
  deps: {
    db: Database;
    ipfsGet: <T>(cid: string) => Promise<T | undefined>;
  }
) {
  const { db, ipfsGet } = deps;
  const id = ethers.utils.getAddress(event.address);

  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["applicationMetadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      applicationMetaPtr: event.params.newMetaPtr.pointer,
      updatedAtBlock: Number(event.blockNumber),
      applicationMetadata: metadata ?? null,
    };
  });
}
