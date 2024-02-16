import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";

import { parseAddress } from "../../../address.js";
import { Changeset } from "../../../database/index.js";

export async function updateApplicationsStartTime({
  event,
  context: { chainId, db },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "ApplicationsStartTimeUpdated"
>): Promise<Changeset[]> {
  const id = parseAddress(event.address);
  const round = await db.getRoundById(chainId, id);
  const updatedTime = new Date(Number(event.params.newTime) * 1000);

  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  return [
    {
      type: "UpdateRound",
      roundId: round.id,
      chainId: round.chainId,
      round: {
        updatedAtBlock: event.blockNumber,
        applicationsStartTime: updatedTime,
      },
    },
  ];
}

export async function updateApplicationsEndTime({
  event,
  context: { chainId, db },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "ApplicationsEndTimeUpdated"
>): Promise<Changeset[]> {
  const id = parseAddress(event.address);
  const round = await db.getRoundById(chainId, id);
  const updatedTime = new Date(Number(event.params.newTime) * 1000);
  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  return [
    {
      type: "UpdateRound",
      roundId: round.id,
      chainId: round.chainId,
      round: {
        updatedAtBlock: event.blockNumber,
        applicationsEndTime: updatedTime,
      },
    },
  ];
}

export async function updateDonationsStartTime({
  event,
  context: { chainId, db },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "RoundStartTimeUpdated"
>): Promise<Changeset[]> {
  const id = parseAddress(event.address);
  const round = await db.getRoundById(chainId, id);
  const updatedTime = new Date(Number(event.params.newTime) * 1000);
  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  return [
    {
      type: "UpdateRound",
      roundId: round.id,
      chainId: round.chainId,
      round: {
        updatedAtBlock: event.blockNumber,
        donationsStartTime: updatedTime,
      },
    },
  ];
}

export async function updateDonationsEndTime({
  event,
  context: { chainId, db },
}: EventHandlerArgs<
  Indexer,
  "AlloV1/RoundImplementation/V2",
  "RoundEndTimeUpdated"
>): Promise<Changeset[]> {
  const id = parseAddress(event.address);
  const round = await db.getRoundById(chainId, id);
  const updatedTime = new Date(Number(event.params.newTime) * 1000);
  if (round === null) {
    throw new Error(`Round ${id} not found`);
  }

  return [
    {
      type: "UpdateRound",
      roundId: round.id,
      chainId: round.chainId,
      round: {
        updatedAtBlock: event.blockNumber,
        donationsEndTime: updatedTime,
      },
    },
  ];
}
