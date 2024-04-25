//  this catches async errors so uncaught promise rejects call the error handler
import "express-async-errors";

import express from "express";
import { Logger } from "pino";
import createHttpLogger from "pino-http";
import cors from "cors";
import * as Sentry from "@sentry/node";

import { createHandler as createApiHandler } from "./api/v1/index.js";
import { PriceProvider } from "../prices/provider.js";
import { PassportProvider } from "../passport/index.js";
import { DataProvider } from "../calculator/dataProvider/index.js";
import { Chain } from "../config.js";
import { Database } from "../database/index.js";

type AsyncRequestHandler = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => Promise<void>;

export interface HttpApiConfig {
  logger: Logger;
  port: number;
  buildTag: string | null;
  priceProvider: PriceProvider;
  db: Database;
  dataProvider: DataProvider;
  passportProvider: PassportProvider;
  graphqlHandler?: AsyncRequestHandler;
  hostname: string;
  chains: Chain[];
  enableSentry: boolean;
  calculator: {
    esimatesLinearQfImplementation:
      | { type: "in-thread" }
      | { type: "worker-pool"; workerPoolSize: number };
  };
}

interface HttpApi {
  start: () => Promise<void>;
  app: express.Application;
}

export const createHttpApi = (config: HttpApiConfig): HttpApi => {
  const app = express();

  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());
  app.use(
    // @ts-expect-error Something wrong with pino-http typings
    createHttpLogger({
      logger: config.logger,
      serializers: {
        // @ts-expect-error Something wrong with pino-http typings
        req(req) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment
          req.body = req.raw.body;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return req;
        },
      },
    })
  );

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
    res.setHeader("x-machine-hostname", config.hostname);
    next();
  });

  app.get("/data/*", staticJsonDataHandler(config.dataProvider));

  app.use("/api/v1", api);

  if (config.graphqlHandler !== undefined) {
    app.use(config.graphqlHandler);
  }

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

function staticJsonDataHandler(dataProvider: DataProvider) {
  return async (req: express.Request, res: express.Response) => {
    if (
      typeof req.params &&
      "0" in req.params &&
      typeof req.params["0"] === "string"
    ) {
      const path = req.params["0"];
      const data = await dataProvider.loadFile(path, path);

      // emulate bigint behaviour in legacy JSON files, they were encoded as strings
      const body = JSON.stringify(data, (_key, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value as unknown;
      });

      res.header("content-type", "application/json");
      res.send(body);
    }
  };
}
