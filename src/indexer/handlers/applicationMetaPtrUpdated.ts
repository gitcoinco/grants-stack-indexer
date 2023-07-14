import { Indexer, JsonStorage } from "chainsauce";
import { Round } from "../types.js";
import { ApplicationMetaPtrUpdatedEvent } from "../events.js";

export default async function applicationMetaPtrUpdated(
  { storage: db }: Indexer<JsonStorage>,
  event: ApplicationMetaPtrUpdatedEvent,
  ipfs: <T>(cid: string) => Promise<T | undefined>
) {
  const id = event.address;

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfs<Round["applicationMetadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      applicationMetaPtr: event.args.newMetaPtr.pointer,
      updatedAtBlock: event.blockNumber,
      applicationMetadata: metadata ?? null,
    };
  });
}
