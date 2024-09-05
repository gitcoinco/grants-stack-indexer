import express from "express";

import { HttpApiConfig } from "../../app.js";

export const createHandler = (config: HttpApiConfig): express.Router => {
  const router = express.Router();

  router.get("/status", (_req, res) => {
    res.json({
      hostname: config.hostname,
      buildTag: config.buildTag,
      chainDataSchemaName: config.db.chainDataSchemaName,
      ipfsDataSchema: config.db.ipfsDataSchemaName,
    });
  });

  return router;
};
