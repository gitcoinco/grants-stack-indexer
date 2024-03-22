import {
  createObjectCsvStringifier,
  createArrayCsvStringifier,
} from "csv-writer";
import express from "express";

import {
  DeprecatedApplication,
  DeprecatedVote,
  createDeprecatedRound,
} from "../../../deprecatedJsonDatabase.js";
import { Round } from "../../../database/schema.js";
import { getVotesWithCoefficients } from "../../../calculator/votes.js";
import ClientError from "../clientError.js";
import { HttpApiConfig } from "../../app.js";
import { extractCalculationConfigFromRound } from "../../../calculator/calculationConfig.js";

export const createHandler = (config: HttpApiConfig): express.Router => {
  const router = express.Router();
  const { dataProvider, db } = config;

  async function exportVotesCSV(chainId: number, round: Round) {
    const votes = await dataProvider.loadFile<DeprecatedVote>(
      "votes",
      `${chainId}/rounds/${round.id}/votes.json`
    );

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

    return csv.getHeaderString()!.concat(csv.stringifyRecords(votes));
  }

  async function exportPricesCSV(chainId: number, round: Round) {
    const prices = await db.getAllChainPrices(chainId);

    const pricesDuringRound = prices.filter(
      (price) =>
        price.timestamp.getTime() >= Number(round.donationsStartTime) * 1000 &&
        price.timestamp.getTime() <= Number(round.donationsEndTime) * 1000
    );

    const csv = createObjectCsvStringifier({
      header: ["token", "code", "price", "timestamp", "block"].map((h) => ({
        id: h,
        title: h,
      })),
    });

    return csv
      .getHeaderString()!
      .concat(csv.stringifyRecords(pricesDuringRound));
  }

  async function exportVoteCoefficientsCSV(chainId: number, round: Round) {
    const applications = await dataProvider.loadFile<DeprecatedApplication>(
      "applications",
      `${chainId}/rounds/${round.id}/applications.json`
    );

    const votes = await dataProvider.loadFile<DeprecatedVote>(
      "votes",
      `${chainId}/rounds/${round.id}/votes.json`
    );

    const chainConfig = config.chains.find((c) => c.id === chainId);
    if (chainConfig === undefined) {
      throw new Error(`Chain ${chainId} not configured`);
    }

    const passportScoreByAddress =
      await config.passportProvider.getScoresByAddresses(
        votes.map((vote) => vote.voter.toLowerCase())
      );

    const calculationConfig = extractCalculationConfigFromRound(
      createDeprecatedRound(round)
    );

    const votesWithCoefficients = getVotesWithCoefficients({
      chain: chainConfig,
      round: createDeprecatedRound(round),
      applications,
      votes,
      minimumAmountUSD: calculationConfig.minimumAmountUSD,
      enablePassport: calculationConfig.enablePassport,
      passportScoreByAddress,
    });

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

  function exportRoundCSV(round: Round) {
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

  async function exportApplicationsCSV(chainId: number, round: Round) {
    const applications = await dataProvider.loadFile<DeprecatedApplication>(
      "applications",
      `${chainId}/rounds/${round.id}/applications.json`
    );

    let questionTitles: Array<string> = [];

    if (
      applications.length > 0 &&
      applications[0].metadata?.application.answers
    ) {
      questionTitles = applications[0].metadata.application.answers.flatMap(
        (answer) => {
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
        application.metadata?.application.answers.flatMap((answer) => {
          if (answer.encryptedAnswer) {
            return [];
          }
          return [answer.answer];
        }) ?? [];

      records.push([
        application.id,
        application.projectId,
        application.status,
        application.metadata?.application.project.title,
        application.metadata?.application.project.website,
        application.metadata?.application.project.projectTwitter,
        application.metadata?.application.project.projectGithub,
        application.metadata?.application.project.userGithub,
        ...answers,
      ]);
    }

    return csv.getHeaderString()!.concat(csv.stringifyRecords(records));
  }

  router.get(
    "/chains/:chainId/rounds/:roundId/exports/:exportName",
    async (req, res) => {
      const chainId = Number(req.params.chainId);
      const roundId = req.params.roundId;
      const exportName = req.params.exportName;
      let body = "";

      if (roundId === null) {
        throw new ClientError("Invalid round id", 400);
      }

      const round = await db.getRoundById(chainId, roundId);

      if (!round) {
        throw new ClientError("Round not found", 404);
      }

      switch (exportName) {
        case "votes": {
          body = await exportVotesCSV(chainId, round);
          break;
        }
        case "applications": {
          body = await exportApplicationsCSV(chainId, round);
          break;
        }
        case "prices": {
          body = await exportPricesCSV(chainId, round);
          break;
        }
        case "round": {
          body = exportRoundCSV(round);
          break;
        }
        case "vote_coefficients": {
          body = await exportVoteCoefficientsCSV(chainId, round);
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

  return router;
};
