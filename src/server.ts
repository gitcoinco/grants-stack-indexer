import express from "express";
import cors from "cors";
import config from "./config.js";

const app = express();

app.use(cors());

app.use(
  "/data",
  express.static(config.storageDir, {
    acceptRanges: true,
    setHeaders: (res) => {
      res.setHeader("Accept-Ranges", "bytes");
    },
  })
);

app.get("/", (_req, res) => {
  res.send("Welcome!");
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
