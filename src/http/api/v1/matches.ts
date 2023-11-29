import express, { Response, Request } from "express";
import { z } from "zod";
import { StaticPool } from "node-worker-threads-pool";

const upload = multer();
import multer from "multer";
import ClientError from "../clientError.js";

import Calculator, {
  Overrides,
  CalculatorOptions,
  parseOverrides,
} from "../../../calculator/index.js";
import { estimateMatches } from "../../../calculator/estimate.js";
import { HttpApiConfig } from "../../app.js";
import { potentialVoteSchema } from "../../../calculator/estimate.js";
import { Round } from "../../../indexer/types.js";
import {
  CalculatorArgs,
  CalculatorResult,
} from "../../../calculator/worker.js";
import { RoundContributionsCache } from "../../../calculator/roundContributionsCache.js";

export const createHandler = (config: HttpApiConfig): express.Router => {
  const router = express.Router();

  const calculatorWorkerPool = new StaticPool<
    (msg: CalculatorArgs) => CalculatorResult
  >({
    size: 10,
    task: "./dist/src/calculator/worker.js",
  });

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
    const roundId = req.params.roundId;

    const minimumAmountUSD = req.query.minimumAmountUSD?.toString();
    const matchingCapAmount = req.query.matchingCapAmount?.toString();

    const enablePassport = boolParam(req.query, "enablePassport");
    const ignoreSaturation = boolParam(req.query, "ignoreSaturation");

    let overrides: Overrides = {};

    if (useOverrides) {
      const file = req.file;
      if (file === undefined || file.fieldname !== "overrides") {
        res.status(400);
        res.send({ error: "overrides param required" });
        return;
      }

      const buf = file.buffer;
      overrides = await parseOverrides(buf);
    }

    const chainConfig = config.chains.find((c) => c.id === chainId);
    if (chainConfig === undefined) {
      throw new Error(`Chain ${chainId} not configured`);
    }

    const calculatorOptions: CalculatorOptions = {
      priceProvider: config.priceProvider,
      dataProvider: config.dataProvider,
      passportProvider: config.passportProvider,
      chainId: chainId,
      roundId: roundId,
      minimumAmountUSD: minimumAmountUSD ? Number(minimumAmountUSD) : undefined,
      matchingCapAmount: matchingCapAmount
        ? BigInt(matchingCapAmount)
        : undefined,
      enablePassport: enablePassport,
      ignoreSaturation: ignoreSaturation,
      overrides,
      chain: chainConfig,
    };

    const calculator = new Calculator(calculatorOptions);
    const matches = await calculator.calculate();
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
    // const reqId = Math.random().toString(36).substring(7);

    const chainId = Number(req.params.chainId);
    const roundId = req.params.roundId;
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

    const rounds = await config.dataProvider.loadFile<Round>(
      "rounds",
      `${chainId}/rounds.json`
    );

    const round = rounds.find((r: Round) => r.id === roundId);

    if (round === undefined) {
      throw new ClientError(`Round ${roundId} not found`, 400);
    }

    const matches = await estimateMatches({
      round,
      chain: chainConfig,
      potentialVotes,
      dataProvider: config.dataProvider,
      priceProvider: config.priceProvider,
      passportProvider: config.passportProvider,
      roundCalculationConfig: {},
      roundContributionsCache,
      calculate: (args) => calculatorWorkerPool.exec(args),
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
