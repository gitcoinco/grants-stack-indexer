import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../indexer.js";
import { Mutation } from "../../database/index.js";
import { Round } from "../../database/schema.js";
import { parseAddress } from "../../address.js";

export default async function ({
  event,
  context: { chainId, ipfsGet },
}: EventHandlerArgs<
  Indexer,
  "RoundImplementationV2",
  "ApplicationMetaPtrUpdated"
>): Promise<Mutation[]> {
  const id = parseAddress(event.address);
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
