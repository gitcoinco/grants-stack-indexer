import express, { Response, Request } from "express";
import { z } from "zod";
import { StaticPool } from "node-worker-threads-pool";

const upload = multer();
import multer from "multer";
import ClientError from "../clientError.js";

import { HttpApiConfig } from "../../app.js";
import {
  LinearQfCalculatorResult,
  LinearQfCalculatorArgs,
  LinearQf,
} from "../../../calculator/linearQf/index.js";
import { RoundContributionsCache } from "../../../calculator/roundContributionsCache.js";
import {
  CoefficientOverrides,
  parseCoefficientOverridesCsv,
} from "../../../calculator/coefficientOverrides.js";
import { calculateMatches } from "../../../calculator/calculateMatches.js";
import {
  potentialVoteSchema,
  calculateMatchingEstimates,
} from "../../../calculator/calculateMatchingEstimates.js";
import { linearQFWithAggregates } from "pluralistic";
import { DeprecatedRound } from "../../../deprecatedJsonDatabase.js";
import { getAddress } from "viem";

function createLinearQf(
  config: HttpApiConfig["calculator"]["esimatesLinearQfImplementation"]
): LinearQf {
  if (config.type === "in-thread") {
    return (args: LinearQfCalculatorArgs) => {
      return Promise.resolve(
        linearQFWithAggregates(
          args.aggregatedContributions,
          args.matchAmount,
          0n,
          args.options
        )
      );
    };
  } else if (config.type === "worker-pool") {
    const calculatorWorkerPool = new StaticPool<
      (msg: LinearQfCalculatorArgs) => LinearQfCalculatorResult
    >({
      size: config.workerPoolSize,
      task: "./dist/src/calculator/linearQf/worker.js",
    });

    return (args: LinearQfCalculatorArgs) => calculatorWorkerPool.exec(args);
  }

  throw new Error("Unimplemented linearQfImplementation type");
}

export const createHandler = (config: HttpApiConfig): express.Router => {
  const router = express.Router();

  const linearQfImpl = createLinearQf(
    config.calculator.esimatesLinearQfImplementation
  );

  const roundContributionsCache = new RoundContributionsCache();

  function boolParam<T extends Record<string, unknown>>(
    object: T,
    name: keyof T
  ): boolean | undefined {
    const param = object[name]?.toString()?.toLowerCase();

    if (param === undefined) {
      return undefined;
    }

    if (param === "true") {
      return true;
    } else if (param === "false") {
      return false;
    } else {
      throw new ClientError(
        `${name.toString()} parameter must be true or false`,
        400
      );
    }
  }

  router.get("/chains/:chainId/rounds/:roundId/matches", async (req, res) => {
    await matchesHandler(req, res, 200, false);
  });

  router.post(
    "/chains/:chainId/rounds/:roundId/matches",
    upload.single("overrides"),
    async (req, res) => {
      await matchesHandler(req, res, 201, true);
    }
  );

  async function matchesHandler(
    req: Request,
    res: Response,
    okStatusCode: number,
    useOverrides: boolean
  ) {
    const chainId = Number(req.params.chainId);
    const roundId = req.params.roundId.startsWith("0x")
      ? getAddress(req.params.roundId)
      : req.params.roundId;

    if (roundId === null) {
      throw new ClientError("Invalid round id", 400);
    }

    const minimumAmountUSD = req.query.minimumAmountUSD?.toString();
    const matchingCapAmount = req.query.matchingCapAmount?.toString();

    const enablePassport = boolParam(req.query, "enablePassport");
    const ignoreSaturation = boolParam(req.query, "ignoreSaturation");

    let overrides: CoefficientOverrides = {};

    if (useOverrides) {
      const file = req.file;
      if (file === undefined || file.fieldname !== "overrides") {
        res.status(400);
        res.send({ error: "overrides param required" });
        return;
      }

      const buf = file.buffer;
      overrides = await parseCoefficientOverridesCsv(buf);
    }

    const chainConfig = config.chains.find((c) => c.id === chainId);
    if (chainConfig === undefined) {
      throw new Error(`Chain ${chainId} not configured`);
    }

    const matches = await calculateMatches({
      roundId: roundId,
      coefficientOverrides: overrides,
      chain: chainConfig,
      calculationConfigOverride: {
        minimumAmountUSD: minimumAmountUSD
          ? Number(minimumAmountUSD)
          : undefined,
        matchingCapAmount: matchingCapAmount
          ? BigInt(matchingCapAmount)
          : undefined,
        enablePassport: enablePassport,
        ignoreSaturation: ignoreSaturation,
      },
      deps: {
        logger: config.logger.child({ subsystem: "Calculator" }),
        dataProvider: config.dataProvider,
        passportProvider: config.passportProvider,
        priceProvider: config.priceProvider,
      },
    });

    const responseBody = JSON.stringify(matches, (_key, value) =>
      typeof value === "bigint" ? value.toString() : (value as unknown)
    );
    res.setHeader("content-type", "application/json");
    res.status(okStatusCode);
    res.send(responseBody);
  }

  router.post("/chains/:chainId/rounds/:roundId/estimate", async (req, res) => {
    await estimateMatchesHandler(req, res, 200);
  });

  const estimateRequestBody = z.object({
    potentialVotes: z.array(potentialVoteSchema),
  });

  async function estimateMatchesHandler(
    req: Request,
    res: Response,
    okStatusCode: number
  ) {
    const chainId = Number(req.params.chainId);
    const roundId = req.params.roundId.startsWith("0x")
      ? getAddress(req.params.roundId)
      : req.params.roundId;

    const potentialVotes = estimateRequestBody
      .parse(req.body)
      .potentialVotes.map((vote) => ({
        ...vote,
        amount: vote.amount,
      }));

    const chainConfig = config.chains.find((c) => c.id === chainId);

    if (chainConfig === undefined) {
      throw new ClientError(`Chain ${chainId} not configured`, 400);
    }

    const rounds = await config.dataProvider.loadFile<DeprecatedRound>(
      "rounds",
      `${chainId}/rounds.json`
    );

    const round = rounds.find((r) => r.id === roundId);

    if (round === undefined) {
      throw new ClientError(`Round ${roundId} not found`, 400);
    }

    const matches = await calculateMatchingEstimates({
      round,
      chain: chainConfig,
      potentialVotes,
      dataProvider: config.dataProvider,
      priceProvider: config.priceProvider,
      passportProvider: config.passportProvider,
      calculationConfigOverride: {},
      roundContributionsCache,
      linearQfImpl,
    });

    const responseBody = JSON.stringify(matches, (_key, value) =>
      typeof value === "bigint" ? value.toString() : (value as unknown)
    );

    res.setHeader("content-type", "application/json");
    res.status(okStatusCode);
    res.send(responseBody);
  }

  return router;
};
