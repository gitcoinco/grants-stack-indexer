import express, { Request, Response } from "express";
import multer from "multer";
import cors from "cors";
import serveIndex from "serve-index";
import path from "node:path";
import { JsonStorage } from "chainsauce";
import { createArrayCsvStringifier } from "csv-writer";

import config from "../config.js";
const upload = multer();

import Calculator, {
  Overrides,
  DataProvider,
  FileSystemDataProvider,
  CalculatorOptions,
  FileNotFoundError,
  ResourceNotFoundError,
  OverridesColumnNotFoundError,
  parseOverrides,
} from "../calculator/index.js";
import fs from "fs";

export const app = express();

function loadDatabase(chainId: string) {
  const storageDir = path.join(config.storageDir, chainId);
  return new JsonStorage(storageDir);
}

app.use(cors());

app.use(
  "/data",
  express.static(config.storageDir, {
    acceptRanges: true,
    setHeaders: (res) => {
      res.setHeader("Accept-Ranges", "bytes");
    }
  }),
  serveIndex(config.storageDir, { icons: true, view: "details" })
);

function handleError(res: Response, err: any) {
  if (err instanceof FileNotFoundError) {
    res.statusCode = 404;
    res.send({
      error: err.message,
    });

    return;
  }

  if (err instanceof ResourceNotFoundError) {
    res.statusCode = 404;
    res.send({
      error: err.message,
    });

    return;
  }

  if (err instanceof OverridesColumnNotFoundError) {
    res.statusCode = 400;
    res.send({
      error: err.message,
    });

    return;
  }

  console.error(err);
  res.statusCode = 500;
  res.send({
    error: "something went wrong",
  });
}

app.get("/", (_req, res) => {
  res.redirect("/data");
});

app.get("/data/:chainId/rounds/:roundId/applications.csv", async (req, res) => {
  const db = loadDatabase(req.params.chainId);

  const applications = await db
    .collection(`rounds/${req.params.roundId}/applications`)
    .all();

  let questionTitles = [];

  if (
    applications.length > 0 &&
    applications[0].metadata?.application.answers
  ) {
    questionTitles = applications[0].metadata.application.answers.map(
      (answer: any) => answer.question
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
      ...questionTitles
    ]
  });

  const records = [];

  for (const application of applications) {
    const answers =
      application.metadata?.application.answers.map(
        (answer: any) => answer.answer || JSON.stringify(answer.encryptedAnswer)
      ) ?? [];

    records.push([
      application.id,
      application.projectId,
      application.status,
      application.metadata.application.project.title,
      application.metadata.application.project.website,
      application.metadata.application.project.projectTwitter,
      application.metadata.application.project.projectGithub,
      application.metadata.application.project.userGithub,
      ...answers
    ]);
  }

  res.setHeader("content-type", "text/csv");
  res.send(csv.getHeaderString() + csv.stringifyRecords(records));
});

app.get("/data/:chainId/rounds/:roundId/votecoefficients.csv", async (req, res) => {
  const db = loadDatabase(req.params.chainId);

  const votes = await db
    .collection(`rounds/${req.params.roundId}/votes`)
    .all();

  const data = fs.readFileSync("./data/passport_scores.json", {
    encoding: "utf8",
    flag: "r"
  });

  /*TODO: type this once we have unified types*/
  const passportScores: any[] = JSON.parse(data);

  const voteCoefficients = votes.map((vote) => {
    const {
      address,
      evidence,
      error,
      ...passport_score
    } = passportScores.find(score => score.address.toLowerCase() === vote.voter.toLowerCase()) ?? {};
    return {
      ...vote,
      ...passport_score,
      ...evidence
    };
  });

  const records = voteCoefficients.map((voteCoefficient) => Object.values(voteCoefficient));

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
      "succes",
      "rawScore",
      "threshold"
    ]
  });

  res.setHeader("content-type", "text/csv");
  res.send(csv.getHeaderString() + csv.stringifyRecords(records));
});

export const calculatorConfig: { dataProvider: DataProvider } = {
  dataProvider: new FileSystemDataProvider("./data")
};

async function matchesHandler(
  req: Request,
  res: Response,
  okStatusCode: number,
  useOverrides: boolean
) {
  const chainId = req.params.chainId;
  const roundId = req.params.roundId;

  const minimumAmount = req.query.minimumAmount?.toString();
  const passportThreshold = req.query.passportThreshold?.toString();
  const enablePassport =
    req.query.enablePassport?.toString()?.toLowerCase() === "true";

  let overrides: Overrides = {};

  if (useOverrides) {
    const file = req.file;
    if (file === undefined || file.fieldname !== "overrides") {
      res.status(400);
      res.send({ error: "overrides param required" });
      return;
    }

    const buf = file.buffer;
    try {
      overrides = await parseOverrides(buf);
    } catch (e) {
      handleError(res, e);
      return;
    }
  }

  const calculatorOptions: CalculatorOptions = {
    dataProvider: calculatorConfig.dataProvider,
    chainId: chainId,
    roundId: roundId,
    minimumAmount: minimumAmount ? Number(minimumAmount) : undefined,
    passportThreshold: passportThreshold
      ? Number(passportThreshold)
      : undefined,
    enablePassport: enablePassport,
    overrides,
  };

  try {
    const calculator = new Calculator(calculatorOptions);
    const matches = calculator.calculate();
    res.status(okStatusCode);
    res.send(matches);
  } catch (e) {
    handleError(res, e);
  }
}

app.get("/chains/:chainId/rounds/:roundId/matches", (req, res) => {
  matchesHandler(req, res, 200, false);
});

app.post(
  "/chains/:chainId/rounds/:roundId/matches",
  upload.single("overrides"),
  (req, res) => {
    matchesHandler(req, res, 201, true);
  }
);
