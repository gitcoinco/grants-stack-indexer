import express, { Response, Request } from "express";
import { z } from "zod";

const upload = multer();
import multer from "multer";
import ClientError from "../clientError.js";

import { Overrides, parseOverrides } from "../../../calculator/index.js";
import { HttpApiConfig } from "../../app.js";
import { calculateMatches } from "../../../calculator/calculateMatches.js";
import { calculateMatchingEstimates } from "../../../calculator/calculateMatchingEstimates.js";

export const createHandler = (config: HttpApiConfig): express.Router => {
  const router = express.Router();

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

    const matches = await calculateMatches({
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
      implementationType: "load-inprocess-calc-inprocess",
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

  async function estimateMatchesHandler(
    req: Request,
    res: Response,
    okStatusCode: number
  ) {
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

    const matches = await calculateMatchingEstimates({
      chainId: chainId,
      roundId: roundId,
      minimumAmountUSD: undefined,
      matchingCapAmount: undefined,
      overrides: {},
      chain: chainConfig,
      potentialVotes,
      implementationType: "load-inprocess-calc-inprocess",
      deps: {
        dataProvider: config.dataProvider,
        passportProvider: config.passportProvider,
        priceProvider: config.priceProvider,
        logger: config.logger.child({ subsystem: "Calculator" }),
      },
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

const potentialVoteSchema = z.object({
  projectId: z.string(),
  roundId: z.string(),
  applicationId: z.string(),
  token: z.string(),
  voter: z.string(),
  grantAddress: z.string(),
  amount: z.coerce.bigint(),
});

const potentialVotesSchema = z.array(potentialVoteSchema);
const estimateRequestBody = z.object({
  potentialVotes: potentialVotesSchema,
});

export type PotentialVotes = z.infer<typeof potentialVotesSchema>;
export type PotentialVote = z.infer<typeof potentialVoteSchema>;
