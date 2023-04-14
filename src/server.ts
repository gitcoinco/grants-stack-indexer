import express from "express";
import cors from "cors";
import serveIndex from "serve-index";
import path from "node:path";
import { JsonStorage } from "chainsauce";
import { createArrayCsvStringifier } from "csv-writer";

import config from "./config.js";
import Calculator from "./calculator.js";

const app = express();
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
    },
  }),
  serveIndex(config.storageDir, { icons: true, view: "details" })
);

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
      ...questionTitles,
    ],
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
      ...answers,
    ]);
  }

  res.setHeader("content-type", "text/csv");
  res.send(csv.getHeaderString() + csv.stringifyRecords(records));
});

app.get("/chains/:chainId/rounds/:roundId/matches", (req, res) => {
  let calculator: Calculator;
  const chainId = req.params.chainId;
  const roundId = req.params.roundId;

  // temporarily hardcoded amount waiting to take this data from the round indexed data
  const matchAmount = 333000;
  const minimumAmount = req.query.minimumAmount?.toString();
  if (minimumAmount) {
    if (isNaN(Number(minimumAmount)) || Number(minimumAmount) < 0) {
      res.status(400).send("invalid minimumAmount");
      return;
    }
    calculator = new Calculator("./data", chainId, roundId, matchAmount, Number(minimumAmount));
  } else {
    calculator = new Calculator("./data", chainId, roundId, matchAmount);
  }

  const matches = calculator.calculate();
  res.send(matches);
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
