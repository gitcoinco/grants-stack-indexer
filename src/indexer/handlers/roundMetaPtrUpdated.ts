import { EventHandlerArgs } from "chainsauce";

import { Round } from "../types.js";
import type { Indexer } from "../indexer.js";
import { ethers } from "ethers";

export default async function ({
  event,
  context: { ipfsGet, db },
}: EventHandlerArgs<Indexer, "RoundImplementationV2", "RoundMetaPtrUpdated">) {
  const id = ethers.utils.getAddress(event.address);

  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["metadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      metadata: metadata ?? null,
      metaPtr: event.params.newMetaPtr.pointer,
    };
  });
}
