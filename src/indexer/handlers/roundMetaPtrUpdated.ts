import { JsonStorage } from "chainsauce";
import { Round } from "../types.js";
import { RoundMetaPtrUpdatedEvent } from "../events.js";

export default async function roundMetaPtrUpdated(
  event: RoundMetaPtrUpdatedEvent,
  deps: {
    ipfsGet: <T>(cid: string) => Promise<T | undefined>;
    db: JsonStorage;
  }
) {
  const { db, ipfsGet } = deps;
  const id = event.address;

  const metaPtr = event.args.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["metadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      metadata: metadata ?? null,
      metaPtr: event.args.newMetaPtr.pointer,
    };
  });
}
