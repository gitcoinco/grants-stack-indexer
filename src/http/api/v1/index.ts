import "express-async-errors";
import express, { NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";

import ClientError from "../clientError.js";
import { createHandler as createExportsHandler } from "./exports.js";
import { createHandler as createMatchesHandler } from "./matches.js";
import { createHandler as createStatusHandler } from "./status.js";
import { HttpApiConfig } from "../../app.js";

export const createHandler = (config: HttpApiConfig): express.Router => {
  const router = express.Router();

  router.use(createMatchesHandler(config));
  router.use(createExportsHandler(config));
  router.use(createStatusHandler(config));

  // handle uncaught errors
  router.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction) => {
      // return client errors
      if (err instanceof ClientError) {
        res.status(err.status);
        res.send({ error: err.message });
        return;
      }

      config.logger?.error({ msg: "Unexpected exception", err });

      Sentry.captureException(err);

      res.statusCode = 500;
      res.send({
        error: "Internal server error",
      });
    }
  );

  return router;
};
