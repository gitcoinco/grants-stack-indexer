//  this catches async errors so uncaught promise rejects call the error handler
import "express-async-errors";

import express from "express";
import cors from "cors";
import serveIndex from "serve-index";

import api from "./api/v1/index.js";
import config from "../config.js";

export const app = express();

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

app.use("/api/v1", api);
