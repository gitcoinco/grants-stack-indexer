import { JsonStorage } from "chainsauce";
import { Round } from "../types.js";
import { ApplicationMetaPtrUpdatedEvent } from "../events.js";

export default async function applicationMetaPtrUpdated(
  event: ApplicationMetaPtrUpdatedEvent,
  deps: {
    db: JsonStorage;
    ipfsGet: <T>(cid: string) => Promise<T | undefined>;
  }
) {
  const { db, ipfsGet } = deps;
  const id = event.address;

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["applicationMetadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      applicationMetaPtr: event.args.newMetaPtr.pointer,
      updatedAtBlock: event.blockNumber,
      applicationMetadata: metadata ?? null,
    };
  });
}
