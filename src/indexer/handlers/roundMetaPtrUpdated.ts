import { Indexer, JsonStorage } from "chainsauce";
import { Round } from "../types.js";
import { RoundMetaPtrUpdatedEvent } from "../events.js";

export default async function roundMetaPtrUpdated(
  { storage: db }: Indexer<JsonStorage>,
  event: RoundMetaPtrUpdatedEvent,
  ipfs: <T>(cid: string) => Promise<T | undefined>
) {
  const id = event.address;

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfs<Round["metadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      metadata: metadata ?? null,
      metaPtr: event.args.newMetaPtr.pointer,
    };
  });
}
