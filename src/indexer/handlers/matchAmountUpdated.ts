import { Indexer, JsonStorage, Event } from "chainsauce";
import { convertToUSD } from "../../prices/index.js";

export default async function (
  { chainId, storage: db }: Indexer<JsonStorage>,
  event: Event
) {
  const id = event.address;
  const matchAmount = event.args.newAmount.toString();

  const round = await db.collection("rounds").findById(id);

  const amountUSD = await convertToUSD(
    chainId,
    round!.token,
    BigInt(matchAmount),
    event.blockNumber
  );

  await db.collection("rounds").updateById(id, (round) => ({
    ...round,
    matchAmount: matchAmount,
    matchAmountUSD: amountUSD.amount,
  }));
}
