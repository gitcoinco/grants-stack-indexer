import { EventHandlerArgs } from "chainsauce";

import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { NewRound, Round } from "../../../database/schema.js";

import { PriceProvider, convertToUSD } from "../../../prices/provider.js";

export async function updateRoundMatchAmount(args: {
  round: Round | NewRound;
  priceProvider: PriceProvider;
  blockNumber: bigint;
  newMatchAmount: bigint;
}): Promise<Changeset> {
  const { round, blockNumber, newMatchAmount, priceProvider } = args;

  const amountUSD = await convertToUSD(
    priceProvider,
    round.chainId,
    round.matchTokenAddress,
    newMatchAmount,
    blockNumber
  );

  return {
    type: "UpdateRound",
    roundId: round.id,
    chainId: round.chainId,
    round: {
      updatedAtBlock: blockNumber,
      matchAmount: newMatchAmount,
      matchAmountInUsd: amountUSD.amount,
    },
  };
}

export default async function ({
  event,
  context: { chainId, priceProvider, db },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "MatchAmountUpdated"
>) {
  const id = event.address;
  const matchAmount = event.params.newAmount;

  const round = await db.getRoundById(chainId, id);

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
