import express from "express";
import database from "../database.js";
import {
  createObjectCsvStringifier,
  createArrayCsvStringifier,
} from "csv-writer";
import { JsonStorage } from "chainsauce";
import { getPrices } from "../prices/index.js";
import { Round } from "../indexer/types.js";

class ClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const router = express.Router();

async function exportVotesCSV(db: JsonStorage, round: Round) {
  const csv = createObjectCsvStringifier({
    header: [
      "id",
      "transaction",
      "blockNumber",
      "projectId",
      "applicationId",
      "roundId",
      "voter",
      "grantAddress",
      "token",
      "amount",
      "amountUSD",
      "amountRoundToken",
    ].map((h) => ({ id: h, title: h })),
  });

  return csv
    .getHeaderString()!
    .concat(
      csv.stringifyRecords(
        await db.collection(`rounds/${round.id}/votes`).all()
      )
    );
}

async function exportPricesCSV(chainId: number, round: Round) {
  const prices = await getPrices(chainId);

  const pricesDuringRound = prices.filter(
    (price) =>
      price.timestamp >= round.roundStartTime &&
      price.timestamp <= round.roundEndTime
  );

  const csv = createObjectCsvStringifier({
    header: ["token", "code", "price", "timestamp", "block"].map((h) => ({
      id: h,
      title: h,
    })),
  });

  return csv.getHeaderString()!.concat(csv.stringifyRecords(pricesDuringRound));
}

async function exportRoundCSV(round: Round) {
  const csv = createObjectCsvStringifier({
    header: [
      "id",
      "amountUSD",
      "votes",
      "token",
      "matchAmount",
      "matchAmountUSD",
      "uniqueContributors",
      "applicationMetaPtr",
      "applicationMetadata",
      "metaPtr",
      "metadata",
      "applicationsStartTime",
      "applicationsEndTime",
      "roundStartTime",
      "roundEndTime",
      "createdAtBlock",
      "updatedAtBlock",
    ].map((h) => ({
      id: h,
      title: h,
    })),
  });

  return csv.getHeaderString()!.concat(csv.stringifyRecords([round]));
}

async function exportApplicationsCSV(db: JsonStorage, round: Round) {
  const applications = await db
    .collection(`rounds/${round.id}/applications`)
    .all();

  let questionTitles = [];

  if (
    applications.length > 0 &&
    applications[0].metadata?.application.answers
  ) {
    questionTitles = applications[0].metadata.application.answers.flatMap(
      (answer: any) => {
        if (answer.encryptedAnswer) {
          return [];
        }
        return [answer.question];
      }
    );
  }

  const csv = createArrayCsvStringifier({
    header: [
      "applicationId",
      "projectId",
      "status",
      "title",
      "website",
      "projecTwitter",
      "projectGithub",
      "userGithub",
      ...questionTitles,
    ],
  });

  const records = [];

  for (const application of applications) {
    const answers =
      application.metadata?.application.answers.flatMap((answer: any) => {
        if (answer.encryptedAnswer) {
          return [];
        }
        return [answer.answer];
      }) ?? [];

    records.push([
      application.id,
      application.projectId,
      application.status,
      application.metadata.application.project.title,
      application.metadata.application.project.website,
      application.metadata.application.project.projectTwitter,
      application.metadata.application.project.projectGithub,
      application.metadata.application.project.userGithub,
      ...answers,
    ]);
  }

  return csv.getHeaderString() + csv.stringifyRecords(records);
}

router.get(
  "/api/v1/chains/:chainId/rounds/:roundId/export",
  async (req, res) => {
    const chainId = Number(req.params.chainId);
    const roundId = req.params.roundId;
    const exportName = req.query.name;
    let body = "";

    try {
      const db = database(chainId);
      const round = await db.collection<Round>("rounds").findById(roundId);

      if (!round) {
        throw new ClientError("Round not found", 404);
      }

      switch (exportName) {
        case "votes": {
          body = await exportVotesCSV(db, round);
          break;
        }
        case "applications": {
          body = await exportApplicationsCSV(db, round);
          break;
        }
        case "prices": {
          body = await exportPricesCSV(chainId, round);
          break;
        }
        case "round": {
          body = await exportRoundCSV(round);
          break;
        }
        default: {
          throw new ClientError("Export not valid", 404);
        }
      }
    } catch (e) {
      if (e instanceof ClientError) {
        res.status(e.status);
        res.send(e.message);
        return;
      }

      // re-throw unexpected error
      throw e;
    }

    res.setHeader("content-type", "text/csv");
    res.setHeader(
      "content-disposition",
      `attachment; filename=${exportName}.csv`
    );
    res.status(200);
    res.send(body);
  }
);

export default router;
