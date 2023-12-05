//  this catches async errors so uncaught promise rejects call the error handler
import "express-async-errors";

import os from "os";
import express from "express";
import { Logger } from "pino";
import cors from "cors";
import serveIndex from "serve-index";
import * as Sentry from "@sentry/node";

import { createHandler as createApiHandler } from "./api/v1/index.js";
import { PriceProvider } from "../prices/provider.js";
import { PassportProvider } from "../passport/index.js";
import { DataProvider } from "../calculator/dataProvider/index.js";
import { Chain } from "../config.js";

export interface HttpApiConfig {
  logger: Logger;
  port: number;
  chainDataDir: string;
  buildTag: string | null;
  priceProvider: PriceProvider;
  dataProvider: DataProvider;
  passportProvider: PassportProvider;
  chains: Chain[];
  enableSentry: boolean;
  calculator: {
    estimateMatchWorkerPool?: {
      size: number;
    };
  };
}

interface HttpApi {
  start: () => Promise<void>;
  app: express.Application;
}

export const createHttpApi = (config: HttpApiConfig): HttpApi => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const api = createApiHandler(config);

  if (config.enableSentry) {
    app.use(
      Sentry.Handlers.requestHandler({
        // default is "cookies", "data", "headers", "method", "query_string", "url"
        request: [
          "cookies",
          "data",
          "headers",
          "method",
          "query_string",
          "url",
          "body",
        ],
      })
    );
  }

  app.use((_req, res, next) => {
    if (config.buildTag !== null) {
      res.setHeader("x-build-tag", config.buildTag);
    }
    res.setHeader("x-machine-hostname", os.hostname());
    next();
  });

  app.use(
    "/data",
    express.static(config.chainDataDir, {
      acceptRanges: true,
      setHeaders: (res) => {
        res.setHeader("Accept-Ranges", "bytes");
      },
    }),
    serveIndex(config.chainDataDir, { icons: true, view: "details" })
  );

  app.get("/", (_req, res) => {
    res.redirect("/data");
  });

  app.use("/api/v1", api);

  // temporary route for backwards compatibility
  app.use("/", api);

  if (config.enableSentry) {
    app.use(Sentry.Handlers.errorHandler());
  }

  return {
    app,
    start() {
      return new Promise<void>((resolve) => {
        app.listen(config.port, () => {
          config.logger.info(`http api listening on port ${config.port}`);
          resolve();
        });
      });
    },
  };
};
