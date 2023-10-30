import { EventHandlerArgs } from "chainsauce";

import { Round } from "../types.js";
import type { Indexer } from "../indexer.js";

export default async function ({
  event,
  context: { ipfsGet, db },
}: EventHandlerArgs<
  Indexer,
  "RoundImplementationV2",
  "ApplicationMetaPtrUpdated"
>) {
  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["applicationMetadata"]>(metaPtr);

  await db.updateRoundById(event.address, {
    applicationMetaPtr: event.params.newMetaPtr.pointer,
    updatedAtBlock: Number(event.blockNumber),
    applicationMetadata: metadata ?? null,
  });
}
