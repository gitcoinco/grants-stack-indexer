import { Indexer, JsonStorage, Event } from "chainsauce";
import { fetchJsonCached as ipfs } from "../../utils/ipfs.js";

export default async function roundMetaPtrUpdated(
  { cache, storage: db }: Indexer<JsonStorage>,
  event: Event
) {
  const id = event.address;

  await db.collection("rounds").updateById(id, (round) => ({
    ...round,
    metaPtr: event.args.newMetaPtr.pointer,
  }));

  return async () => {
    const metaPtr = event.args.newMetaPtr.pointer;
    const metadata = await ipfs(metaPtr, cache);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.collection("rounds").updateById(id, (round: any) => {
      if (round.metaPtr === event.args.newMetaPtr.pointer) {
        return { ...round, metadata };
      }

      return round;
    });
  };
}
