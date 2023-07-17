//  this catches async errors so uncaught promise rejects call the error handler
import "express-async-errors";

import express from "express";
import cors from "cors";
import serveIndex from "serve-index";

import { createHandler as createApiHandler } from "./api/v1/index.js";
import { PriceProvider } from "../prices/provider.js";
import { DataProvider } from "../calculator/index.js";

export interface HttpApiConfig {
  storageDir: string;
  getPriceProvider: (chainId: number) => PriceProvider;
  getDataProvider: (chainId: number) => DataProvider;
}

export const createHttpApi = (config: HttpApiConfig): express.Application => {
  const app = express();
  const api = createApiHandler(config);

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

  // temporary route for backwards compatibility
  app.use("/", api);

  return app;
};
