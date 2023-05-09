import "express-async-errors";
import express, { NextFunction, Request, Response, Router } from "express";

import * as Sentry from "../../../sentry.js";

import ClientError from "../clientError.js";
import exports from "./exports.js";
import matches from "./matches.js";

const router = express.Router();

router.use(exports);
router.use(matches);

// handle uncaught errors
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // return client errors
  if (err instanceof ClientError) {
    res.status(err.status);
    res.send({ error: err.message });
    return;
  }

  console.error("Unexpected exception", err);

  Sentry.captureException(err);

  res.statusCode = 500;
  res.send({
    error: "Internal server error",
  });
});

export default router;
