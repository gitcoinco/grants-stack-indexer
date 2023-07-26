import { JsonStorage } from "chainsauce";
import { Round } from "../types.js";
import { MatchAmountUpdatedEvent } from "../events.js";
import { PriceProvider } from "../../prices/provider.js";

export default async function (
  event: MatchAmountUpdatedEvent,
  deps: {
    chainId: number;
    priceProvider: PriceProvider;
    db: JsonStorage;
  }
) {
  const { db, priceProvider, chainId } = deps;
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
