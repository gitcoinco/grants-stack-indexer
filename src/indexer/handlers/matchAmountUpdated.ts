import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../indexer.js";
import { Mutation, Round } from "../../database/postgres.js";
import { PriceProvider } from "../../prices/provider.js";

export async function updateRoundMatchAmount(args: {
  round: Round;
  priceProvider: PriceProvider;
  blockNumber: bigint;
  newMatchAmount: bigint;
}): Promise<Mutation> {
  const { round, blockNumber, newMatchAmount, priceProvider } = args;

  const amountUSD = await priceProvider.convertToUSD(
    round.chainId,
    round.matchTokenAddress,
    BigInt(newMatchAmount),
    Number(blockNumber)
  );

  return {
    type: "UpdateRound",
    roundId: round.id,
    chainId: round.chainId,
    round: {
      updatedAtBlock: blockNumber,
      matchAmount: newMatchAmount,
      matchAmountInUSD: amountUSD.amount,
    },
  };
}

export default async function ({
  event,
  context: { chainId, priceProvider, db },
}: EventHandlerArgs<Indexer, "RoundImplementationV2", "MatchAmountUpdated">) {
  const id = event.address;
  const matchAmount = event.params.newAmount;

  const round = await db.query({ type: "RoundById", roundId: id, chainId });

  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  return [
    await updateRoundMatchAmount({
      round,
      blockNumber: event.blockNumber,
      newMatchAmount: matchAmount,
      priceProvider,
    }),
  ];
}
