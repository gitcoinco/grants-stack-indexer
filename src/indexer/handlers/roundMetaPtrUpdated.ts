import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../indexer.js";
import { Mutation, Round } from "../../database/postgres.js";

export default async function ({
  event,
  context: { ipfsGet, chainId },
}: EventHandlerArgs<
  Indexer,
  "RoundImplementationV2",
  "RoundMetaPtrUpdated"
>): Promise<Mutation[]> {
  const id = event.address;

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
