import { Database } from "chainsauce";
import { Round } from "../types.js";
import { MatchAmountUpdatedEvent } from "../events.js";
import { PriceProvider } from "../../prices/provider.js";
import { ethers } from "ethers";

export default async function (
  event: MatchAmountUpdatedEvent,
  deps: {
    chainId: number;
    priceProvider: PriceProvider;
    db: Database;
  }
) {
  const { db, priceProvider, chainId } = deps;
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
