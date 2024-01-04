import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { Round } from "../../../database/schema.js";
import { parseAddress } from "../../../address.js";

export default async function ({
  event,
  context: { ipfsGet, chainId },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "RoundMetaPtrUpdated"
>): Promise<Changeset[]> {
  const id = parseAddress(event.address);

  const metaPtr = event.params.newMetaPtr.pointer;
  const metadata = await ipfsGet<Round["roundMetadata"]>(metaPtr);

  return [
    {
      type: "UpdateRound",
      roundId: id,
      chainId,
      round: {
        roundMetadata: metadata ?? null,
        roundMetadataCid: event.params.newMetaPtr.pointer,
      },
    },
  ];
}
