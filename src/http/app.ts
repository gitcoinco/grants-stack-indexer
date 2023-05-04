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

const processPassportScores = (scores: FullPassportScore[]): PassportScoresMap => {
  return scores.reduce((map, score) => {
    const address = score.address.toLowerCase();
    const { evidence, error, ...remainingScore } = score;
    const coefficient = evidence !== null && evidence.success ? 1 : 0;
    map[address] = { ...remainingScore, ...evidence, coefficient };
    return map;
  }, {} as PassportScoresMap);
};

app.get("/data/:chainId/rounds/:roundId/vote_coefficients.csv", async (req, res) => {
  const { chainId, roundId } = req.params;
  const db = loadDatabase(chainId);

  try {
    const [votes, data] = await Promise.all([
      db.collection(`rounds/${roundId}/votes`).all(),
      fs.promises.readFile("./data/passport_scores.json", { encoding: "utf8", flag: "r" }),
    ]);

    const passportScores: FullPassportScore[] = JSON.parse(data);
    const passportScoresMap = processPassportScores(passportScores);

    const records = votes.map((vote: any) => {
      const voter = vote.voter.toLowerCase();
      const score = passportScoresMap[voter];
      const coefficient = score !== undefined ? 1 : 0;
      const combinedVote = {
      ...vote,
      ...(score ?? {}),
      coefficient,
      };

      return [
        combinedVote.id,
        combinedVote.projectId,
        combinedVote.applicationId,
        combinedVote.roundId,
        combinedVote.token,
        voter,
        combinedVote.grantAddress,
        combinedVote.amount,
        combinedVote.amountUSD,
        combinedVote.coefficient,
        combinedVote.status,
        combinedVote.last_score_timestamp,
        combinedVote.type,
        combinedVote.success,
        combinedVote.rawScore,
        combinedVote.threshold,
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

    res.setHeader("content-type", "text/csv");
    res.send(csv.getHeaderString() + csv.stringifyRecords(records));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal server error");
  }
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
  const chainId = Number(req.params.chainId);
  const roundId = req.params.roundId;

  const minimumAmount = req.query.minimumAmount?.toString();
  const passportThreshold = req.query.passportThreshold?.toString();
  const matchingCapAmount = req.query.matchingCapAmount?.toString();
  const enablePassport =
    req.query.enablePassport?.toString()?.toLowerCase() === "true";

  const ignoreSaturation = 
    req.query.ignoreSaturation?.toString()?.toLowerCase() === "true";

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
    minimumAmount: minimumAmount ? BigInt(minimumAmount) : undefined,
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

  try {
    const calculator = new Calculator(calculatorOptions);
    const matches = await calculator.calculate();
    const responseBody = JSON.stringify(matches, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    res.setHeader("content-type", "application/json");
    res.status(okStatusCode);
    res.send(responseBody);
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
