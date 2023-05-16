import { Indexer, JsonStorage } from "chainsauce";
import { fetchJsonCached as ipfs } from "../../utils/ipfs.js";
import { Round } from "../types.js";

export default async function roundMetaPtrUpdated(
  { cache, storage: db }: Indexer<JsonStorage>,
  event: RoundMetaPtrUpdatedEvent
) {
  const id = event.address;

  await db.collection<Round>("rounds").updateById(id, (round) => ({
    ...round,
    metaPtr: event.args.newMetaPtr.pointer,
  }));

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfs<Round["metadata"]>(metaPtr, cache);

  if (!metadata) {
    return;
  }

  await db.collection<Round>("rounds").updateById(id, (round) => {
    if (round.metaPtr === event.args.newMetaPtr.pointer) {
      return { ...round, metadata };
    }

    return round;
  });
}
