import { EventHandlerArgs } from "chainsauce";

import { Round } from "../types.js";
import type { Indexer } from "../indexer.js";
import { ethers } from "ethers";

export default async function ({
  event,
  context: { chainId, priceProvider, db },
}: EventHandlerArgs<Indexer, "RoundImplementationV2", "MatchAmountUpdated">) {
  const id = ethers.utils.getAddress(event.address);
  const matchAmount = event.params.newAmount.toString();

  const round = await db.collection<Round>("rounds").findById(id);

  if (!round) {
    throw new Error(`Round ${id} not found`);
  }

  const amountUSD = await priceProvider.convertToUSD(
    chainId,
    round.token,
    BigInt(matchAmount),
    Number(event.blockNumber)
  );

  await db.collection<Round>("rounds").updateById(id, (round) => ({
    ...round,
    updatedAtBlock: Number(event.blockNumber.toString()),
    matchAmount: matchAmount,
    matchAmountUSD: amountUSD.amount,
  }));
}
