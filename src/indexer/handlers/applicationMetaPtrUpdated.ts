import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../indexer.js";
import { Mutation } from "../../database/index.js";
import { Round } from "../../database/schema.js";

export default async function ({
  event,
  context: { chainId, ipfsGet },
}: EventHandlerArgs<
  Indexer,
  "RoundImplementationV2",
  "ApplicationMetaPtrUpdated"
>): Promise<Mutation[]> {
  const id = event.address;
  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["applicationMetadata"]>(metaPtr);

  return [
    {
      type: "UpdateRound",
      roundId: id,
      chainId,
      round: {
        applicationMetadataCid: event.params.newMetaPtr.pointer,
        updatedAtBlock: event.blockNumber,
        applicationMetadata: metadata ?? null,
      },
    },
  ];
}
