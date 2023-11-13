import { EventHandlerArgs } from "chainsauce";

import { Round } from "../types.js";
import type { Indexer } from "../indexer.js";

export default async function ({
  event,
  context: { chainId, ipfsGet, db },
}: EventHandlerArgs<
  Indexer,
  "RoundImplementationV2",
  "ApplicationMetaPtrUpdated"
>) {
  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["applicationMetadata"]>(metaPtr);

  await db.updateRoundById(
    { roundId: event.address, chainId },
    {
      applicationMetadataCid: event.params.newMetaPtr.pointer,
      updatedAtBlock: event.blockNumber,
      applicationMetadata: metadata ?? null,
    }
  );
}
