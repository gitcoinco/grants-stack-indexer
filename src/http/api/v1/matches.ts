import express, { Response, Request } from "express";
const upload = multer();
import multer from "multer";
import ClientError from "../clientError.js";

import Calculator, {
  Overrides,
  CalculatorOptions,
  parseOverrides,
} from "../../../calculator/index.js";
import { HttpApiConfig } from "../../app.js";

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
    const passportThreshold = req.query.passportThreshold?.toString();
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
      passportThreshold: passportThreshold
        ? Number(passportThreshold)
        : undefined,
      enablePassport: enablePassport,
      ignoreSaturation: ignoreSaturation,
      overrides,
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

  return router;
};
