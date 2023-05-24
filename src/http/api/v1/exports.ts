import {
  createObjectCsvStringifier,
  createArrayCsvStringifier,
} from "csv-writer";
import { JsonStorage } from "chainsauce";
import express from "express";

import database from "../../../database.js";
import { getPrices } from "../../../prices/index.js";
import { Round, Application, Vote } from "../../../indexer/types.js";
import { getVotesWithCoefficients } from "../../../calculator/votes.js";
import ClientError from "../clientError.js";
import fs from "fs/promises";
import { PassportScore } from "../../../passport/index.js";

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
      price.timestamp >= round.roundStartTime * 1000 &&
      price.timestamp <= round.roundEndTime * 1000
  );

  const csv = createObjectCsvStringifier({
    header: ["token", "code", "price", "timestamp", "block"].map((h) => ({
      id: h,
      title: h,
    })),
  });

  return csv.getHeaderString()!.concat(csv.stringifyRecords(pricesDuringRound));
}

<<<<<<< HEAD
async function exportVoteCoefficientsCSV(db: JsonStorage, round: Round) {
  const [applications, votes, passportScoresString] = await Promise.all([
    db.collection<Application>(`rounds/${round.id}/applications`).all(),
    db.collection<Vote>(`rounds/${round.id}/votes`).all(),
    fs.promises.readFile("./data/passport_scores.json", {
      encoding: "utf8",
      flag: "r",
    }),
  ]);

  const passportScores = JSON.parse(
    passportScoresString
  ) as Array<PassportScore>;

  const votesWithCoefficients = await getVotesWithCoefficients(
    round,
    applications,
    votes,
    passportScores,
    {}
  );

  const records = votesWithCoefficients.flatMap((vote) => {
    return [
      [
        vote.id,
        vote.projectId,
        vote.applicationId,
        vote.roundId,
        vote.token,
        vote.voter,
        vote.grantAddress,
        vote.amount,
        vote.amountUSD,
        vote.coefficient,
        vote.passportScore?.status,
        vote.passportScore?.last_score_timestamp,
        vote.passportScore?.evidence?.type,
        vote.passportScore?.evidence?.success,
        vote.passportScore?.evidence?.rawScore,
        vote.passportScore?.evidence?.threshold,
      ],
    ];
  });

  const csv = createArrayCsvStringifier({
    header: [
      "id",
      "projectId",
      "applicationId",
      "roundId",
      "token",
      "voter",
      "grantAddress",
      "amount",
      "amountUSD",
      "coefficient",
      "status",
      "last_score_timestamp",
      "type",
      "success",
      "rawScore",
      "threshold",
    ],
  });

  const header = csv.getHeaderString();

  if (!header) {
    throw new Error("failed to generate CSV header");
  }

  return header.concat(csv.stringifyRecords(records));
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

// temporary route for backwards compatibility
router.get(
  "/data/:chainId/rounds/:roundId/vote_coefficients.csv",
  async (req, res) => {
    const chainId = Number(req.params.chainId);
    const roundId = req.params.roundId;
    const db = database(chainId);
    const round = await db.collection<Round>("rounds").findById(roundId);

    if (!round) {
      throw new ClientError("Round not found", 404);
    }

    const body = await exportVoteCoefficientsCSV(db, chainId, round);

    res.setHeader("content-type", "text/csv");
    res.setHeader(
      "content-disposition",
      `attachment; filename=vote_coefficients-${round.id}.csv`
    );
    res.status(200);
    res.send(body);
  }
);

router.get(
  "/chains/:chainId/rounds/:roundId/exports/:exportName",
  async (req, res) => {
    const chainId = Number(req.params.chainId);
    const roundId = req.params.roundId;
    const exportName = req.params.exportName;
    let body = "";

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
      case "vote_coefficients": {
        body = await exportVoteCoefficientsCSV(db, chainId, round);
        break;
      }
      default: {
        throw new ClientError("Export not valid", 404);
      }
    }

    res.setHeader("content-type", "text/csv");
    res.setHeader(
      "content-disposition",
      `attachment; filename=${exportName}-${round.id}.csv`
    );
    res.status(200);
    res.send(body);
  }
);

export default router;
