import {
  createObjectCsvStringifier,
  createArrayCsvStringifier,
} from "csv-writer";
import { JsonStorage } from "chainsauce";
import express from "express";
import fs from "fs";

import database from "../../../database.js";
import { getPrices } from "../../../prices/index.js";
import { Round, Application, Vote } from "../../../indexer/types.js";
import ClientError from "../clientError.js";

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

type BasePassportScore = {
  address: string;
  score: string | null;
  status: string;
  last_score_timestamp: string;
};

type FullPassportScore = BasePassportScore & {
  evidence: {
    type: string;
    success: boolean;
    rawScore: string;
    threshold: string;
  } | null;
  error?: string;
};

type FlatPassportScoreWithCoefficient = BasePassportScore & {
  coefficient: 0 | 1;
  type?: string;
  success?: boolean;
  rawScore?: string;
  threshold?: string;
};

type PassportScoresMap = {
  [address: string]: FlatPassportScoreWithCoefficient;
};

async function exportVoteCoefficientsCSV(db: JsonStorage, round: Round) {
  const processPassportScores = (
    scores: FullPassportScore[]
  ): PassportScoresMap => {
    return scores.reduce((map, score) => {
      const address = score.address.toLowerCase();
      const { evidence, ...remainingScore } = score;
      const coefficient = evidence !== null && evidence.success ? 1 : 0;
      map[address] = { ...remainingScore, ...evidence, coefficient };
      return map;
    }, {} as PassportScoresMap);
  };

  const [applications, votes, data] = await Promise.all([
    db.collection<Application>(`rounds/${round.id}/applications`).all(),
    db.collection<Vote>(`rounds/${round.id}/votes`).all(),
    fs.promises.readFile("./data/passport_scores.json", {
      encoding: "utf8",
      flag: "r",
    }),
  ]);

  const applicationMap = applications.reduce((map, application) => {
    map[application.id] = application;
    return map;
  }, {} as Record<string, Application>);

  const isPassportEnabled =
    round?.metadata?.quadraticFundingConfig?.sybilDefense ?? false;

  const minimumAmount = Number(
    round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount ?? 0
  );

  const passportScores: FullPassportScore[] = JSON.parse(data);
  const passportScoresMap = processPassportScores(passportScores);

  const records = votes.flatMap((vote) => {
    const voter = vote.voter.toLowerCase();
    const score = passportScoresMap[voter];

    let coefficient = 0;

    // If passport is enabled and the score exists or passport is disabled
    if ((isPassportEnabled && score) || !isPassportEnabled) {
      coefficient = 1;
    }

    if (vote.amountUSD < minimumAmount) {
      coefficient = 0;
    }

    if (applicationMap[vote.applicationId]?.status !== "APPROVED") {
      return [];
    }

    const combinedVote = {
      ...vote,
      ...score,
    };

    return [
      [
        combinedVote.id,
        combinedVote.projectId,
        combinedVote.applicationId,
        combinedVote.roundId,
        combinedVote.token,
        voter,
        combinedVote.grantAddress,
        combinedVote.amount,
        combinedVote.amountUSD,
        coefficient,
        combinedVote.status,
        combinedVote.last_score_timestamp,
        combinedVote.type,
        combinedVote.success,
        combinedVote.rawScore,
        combinedVote.threshold,
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

  return csv.getHeaderString()!.concat(csv.stringifyRecords(records));
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

    const body = await exportVoteCoefficientsCSV(db, round);

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
        body = await exportVoteCoefficientsCSV(db, round);
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
