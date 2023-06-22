import { Indexer, JsonStorage } from "chainsauce";
import { fetchJsonCached as ipfs } from "../../utils/ipfs.js";
import { Round } from "../types.js";
import { Events } from "../events.js";

export default async function applicationMetaPtrUpdated(
  { cache, storage: db }: Indexer<JsonStorage>,
  event: Events["ApplicationMetaPtrUpdated"]
) {
  const id = event.address;

  const args = event.args as {
    newMetaPtr: { pointer: string };
  };

  await db.collection<Round>("rounds").updateById(id, (round) => ({
    ...round,
    applicationMetaPtr: args.newMetaPtr.pointer,
    updatedAtBlock: event.blockNumber,
  }));

  const metaPtr = args.newMetaPtr.pointer;
  const metadata = await ipfs<Round["applicationMetadata"]>(metaPtr, cache);

  if (!metadata) {
    return;
  }

  await db.collection<Round>("rounds").updateById(id, (round) => {
    if (round.applicationMetaPtr === args.newMetaPtr.pointer) {
      return { ...round, applicationMetadata: metadata };
    }

    return round;
  });
}
