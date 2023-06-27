import "../sentry.js";
import { createService } from "../indexer/service.js";
import { readServiceConfigFromArgs } from "./indexer-cli-args.js";

const service = createService(await readServiceConfigFromArgs());

service.start();
