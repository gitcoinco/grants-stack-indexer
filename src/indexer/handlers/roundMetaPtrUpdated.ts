import { Indexer, JsonStorage } from "chainsauce";
import { fetchJsonCached as ipfs } from "../../utils/ipfs.js";
import { Round } from "../types.js";
import { RoundMetaPtrUpdatedEvent } from "../events.js";

export default async function roundMetaPtrUpdated(
  { cache, storage: db }: Indexer<JsonStorage>,
  event: RoundMetaPtrUpdatedEvent
) {
  const id = event.address;

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfs<Round["metadata"]>(metaPtr, cache);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      metadata: metadata ?? null,
      metaPtr: event.args.newMetaPtr.pointer,
    };
  });
}
