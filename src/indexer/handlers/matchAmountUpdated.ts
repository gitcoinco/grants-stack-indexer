import { Indexer, JsonStorage } from "chainsauce";
import { Round } from "../types.js";
import { MatchAmountUpdatedEvent } from "../events.js";
import { PriceProvider } from "../../prices/index.js";

export default async function (
  { chainId, storage: db }: Indexer<JsonStorage>,
  priceProvider: PriceProvider,
  event: MatchAmountUpdatedEvent
) {
  const id = event.address;
  const matchAmount = event.args.newAmount.toString();

  const round = await db.collection<Round>("rounds").findById(id);

  if (!round) {
    throw new Error(`Round ${id} not found`);
  }

  const amountUSD = await priceProvider.convertToUSD(
    chainId,
    round.token,
    BigInt(matchAmount),
    event.blockNumber
  );

  await db.collection<Round>("rounds").updateById(id, (round) => ({
    ...round,
    updatedAtBlock: event.blockNumber,
    matchAmount: matchAmount,
    matchAmountUSD: amountUSD.amount,
  }));
}
