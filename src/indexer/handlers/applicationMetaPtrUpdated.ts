import { EventHandlerArgs } from "chainsauce";

import { Round } from "../types.js";
import type { Indexer } from "../indexer.js";
import { ethers } from "ethers";

export default async function ({
  event,
  context: { ipfsGet, db },
}: EventHandlerArgs<
  Indexer,
  "RoundImplementationV2",
  "ApplicationMetaPtrUpdated"
>) {
  const id = ethers.utils.getAddress(event.address);

  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["applicationMetadata"]>(metaPtr);

  await db.collection<Round>("rounds").updateById(id, (round) => {
    return {
      ...round,
      applicationMetaPtr: event.params.newMetaPtr.pointer,
      updatedAtBlock: Number(event.blockNumber),
      applicationMetadata: metadata ?? null,
    };
  });
}
