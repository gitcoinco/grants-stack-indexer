import { Indexer, JsonStorage } from "chainsauce";
import { fetchJsonCached as ipfs } from "../../utils/ipfs.js";
import { Round } from "../types.js";
import { ApplicationMetaPtrUpdatedEvent } from "../events.js";

export default async function applicationMetaPtrUpdated(
  { cache, storage: db }: Indexer<JsonStorage>,
  event: ApplicationMetaPtrUpdatedEvent
) {
  const id = event.address;

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfs<Round["applicationMetadata"]>(metaPtr, cache);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      applicationMetaPtr: event.args.newMetaPtr.pointer,
      updatedAtBlock: event.blockNumber,
      applicationMetadata: metadata ?? null,
    };
  });
}
