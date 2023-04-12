import express from "express";
import cors from "cors";
import serveIndex from "serve-index";

import config from "./config.js";
import Calculator from "./calculator.js";

const app = express();

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

app.get("/chains/:chainId/rounds/:roundId/matches", (req, res) => {
  const chainId = req.params.chainId;
  const roundId = req.params.roundId;

  const c = new Calculator("./data", chainId, roundId);
  const matches = c.calculate();

  res.send(matches);
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
