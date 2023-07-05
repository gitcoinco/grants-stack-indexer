import "../sentry.js";
import { app } from "./app.js";
import { getApiConfig } from "../config.js";

const config = getApiConfig();

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
