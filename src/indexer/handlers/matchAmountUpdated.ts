import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../indexer.js";

export default async function ({
  event,
  context: { chainId, priceProvider, db },
}: EventHandlerArgs<Indexer, "RoundImplementationV2", "MatchAmountUpdated">) {
  const id = event.address;
  const matchAmount = event.params.newAmount.toString();

  const round = await db.getRoundById(id);

  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  const amountUSD = await priceProvider.convertToUSD(
    chainId,
    round.token,
    BigInt(matchAmount),
    Number(event.blockNumber)
  );

  await db.updateRoundById(id, {
    updatedAtBlock: Number(event.blockNumber.toString()),
    matchAmount: matchAmount,
    matchAmountUSD: amountUSD.amount,
  });
}
