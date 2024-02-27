import { EventHandlerArgs } from "chainsauce";
import { parseAddress } from "../../../address.js";
import { Changeset } from "../../../database/index.js";
import { Round } from "../../../database/schema.js";

import type { Indexer } from "../../indexer.js";

export default async function ({
  event,
  context: { chainId, ipfsGet },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "ApplicationMetaPtrUpdated"
>): Promise<Changeset[]> {
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
