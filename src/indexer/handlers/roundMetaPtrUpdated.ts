import { EventHandlerArgs } from "chainsauce";

import { Round } from "../types.js";
import type { Indexer } from "../indexer.js";

export default async function ({
  event,
  context: { ipfsGet, db, chainId },
}: EventHandlerArgs<Indexer, "RoundImplementationV2", "RoundMetaPtrUpdated">) {
  const id = event.address;

  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["metadata"]>(metaPtr);

  await db.updateRoundById(
    { roundId: id, chainId },
    {
      roundMetadata: metadata ?? null,
      roundMetadataCid: event.params.newMetaPtr.pointer,
    }
  );
}
