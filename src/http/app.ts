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
import { Indexer } from "chainsauce";
import { recoverMessageAddress } from "viem";

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
  dataVersion?: string;
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
  indexedChains?: Indexer<any, any>[] | null;
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

  app.get("/version", (_req, res) => {
    res.send(config.dataVersion);
  });

  app.get("/config", (_req, res) => {
    res.send(config);
  });

  app.post("/index", (req, res) => {
    try {
      const { chainId, address, timestamp, signature } = req.body as {
        chainId: string;
        address: string;
        timestamp: number;
        signature: `0x${string}`;
      };

      const reindex = async () => {
        if (!chainId || !config.indexedChains) {
          return res.status(400).send("chainId is required");
        }

        try {
          const isAuthenticated = await recoverEthereumAddress({
            address,
            timestamp,
            signature,
          });

          config.logger.info(
            `Reindexing chain ${chainId} requested by ${address} at ${timestamp}`
          );

          if (isAuthenticated) {
            await config.db.deleteChainData(Number(chainId));

            const filteredIndexedChains = config.indexedChains.filter(
              (chain) =>
                (chain as { context: { chainId: number } }).context.chainId ===
                Number(chainId)
            );

            if (filteredIndexedChains.length === 0) {
              config.logger.error(`Chain ${chainId} not found`);
              return res.status(400).send("chain not found");
            }

            const filteredChains = config.chains.filter(
              (chain) => chain.id === Number(chainId)
            );

            if (filteredChains.length === 0) {
              config.logger.error(`Chain ${chainId} not found`);
              return res.status(400).send("chain not found");
            }

            const chain = filteredChains[0];
            const indexedChain = filteredIndexedChains[0];

            chain.subscriptions.forEach((subscription) => {
              indexedChain.unsubscribeFromContract({
                address: subscription.address,
              });

              const contractName = subscription.contractName;
              const subscriptionFromBlock =
                subscription.fromBlock === undefined
                  ? undefined
                  : BigInt(subscription.fromBlock);

              indexedChain.subscribeToContract({
                contract: contractName,
                address: subscription.address,
                fromBlock: subscriptionFromBlock || BigInt(0),
              });
            });
          } else {
            config.logger.error(
              `Reindexing chain ${chainId} requested by ${address} at ${timestamp} failed authentication`
            );
            return res.status(401).send("Authentication failed");
          }
        } catch {
          config.logger.error(
            `Reindexing chain ${chainId} requested by ${address} at ${timestamp} failed with error`
          );
          return res.status(500).send("An error occurred");
        }
      };

      reindex()
        .then(() => {
          config.logger.info(`Reindexing of chain ${chainId} finished`);
          res.send("Reindexing finished");
        })
        .catch(() => {
          config.logger.error(
            `Reindexing of chain ${chainId} failed with error`
          );
          res.status(500).send("An error occurred");
        });
    } catch {
      config.logger.error(`Reindexing failed with error`);
      res.status(500).send("An error occurred");
    }
  });

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

const VALIDITY_PERIOD = 1 * 60 * 1000; // 1 minute validity period

const recoverEthereumAddress = async ({
  address,
  timestamp,
  signature,
}: {
  address: string;
  timestamp: number;
  signature: `0x${string}`;
}) => {
  if (!address || !timestamp || !signature) {
    return false;
  }
  const whitelistedAddresses: string[] = JSON.parse(
    process.env.WHITELISTED_ADDRESSES!
  );

  // Check timestamp validity
  const currentTime = Date.now();
  if (currentTime - timestamp > VALIDITY_PERIOD) {
    return false;
  }

  // Construct the expected message to be signed
  const expectedMessage = `Authenticate with timestamp: ${timestamp}`;
  try {
    // Recover address from signature and expected message
    const recoveredAddress = await recoverMessageAddress({
      message: expectedMessage,
      signature,
    });

    const whitelistedAddressesLowercase = whitelistedAddresses.map((addr) =>
      addr.toLowerCase()
    );

    if (
      recoveredAddress.toLowerCase() === address.toLowerCase() &&
      whitelistedAddressesLowercase.includes(address.toLowerCase())
    ) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error verifying signature:", error);
    return false;
  }
};
