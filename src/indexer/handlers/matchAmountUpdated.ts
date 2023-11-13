import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../indexer.js";

export default async function ({
  event,
  context: { chainId, priceProvider, db },
}: EventHandlerArgs<Indexer, "RoundImplementationV2", "MatchAmountUpdated">) {
  const id = event.address;
  const matchAmount = event.params.newAmount;

  const round = await db.getRoundById({ roundId: id, chainId });

  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  const amountUSD = await priceProvider.convertToUSD(
    chainId,
    round.matchTokenAddress,
    BigInt(matchAmount),
    Number(event.blockNumber)
  );

  await db.updateRoundById(
    { roundId: id, chainId },
    {
      updatedAtBlock: event.blockNumber,
      matchAmount: matchAmount,
      matchAmountInUSD: amountUSD.amount,
    }
  );
}
