import { ethers } from "ethers";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import "../sentry.js";
import { getPassportConfig, PassportConfig } from "../config.js";

const config = getPassportConfig();

import {
  filterPassportByEvidence,
  getPassportScores,
} from "../passport/index.js";

const { values: args } = parseArgs({
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
  },
});

// Update every hour
const updateEveryMs = 60 * 60 * 1000;

async function getScoresAndWrite(config: PassportConfig) {
  let isOutdated = false;

  try {
    const stats = await Promise.all([
      fs.stat(path.join(config.storageDir, "passport_scores.json")),
      fs.stat(path.join(config.storageDir, "passport_valid_addresses.json")),
    ]);

    isOutdated = stats.some(
      (stat) => Date.now() - stat.mtimeMs > updateEveryMs
    );
  } catch (e) {
    isOutdated = true;
  }

  if (!isOutdated) {
    console.log("Passport scores are up to date, skipping");
    return;
  }

  console.log("Fetching passport scores...");

  const scores = await getPassportScores(config);

  const validAddresses = filterPassportByEvidence(scores).map((passport) => {
    return ethers.utils.getAddress(passport.address);
  });

  await fs.mkdir(config.storageDir, { recursive: true });
  await fs.writeFile(
    path.join(config.storageDir, "passport_scores.json"),
    JSON.stringify(scores)
  );
  await fs.writeFile(
    path.join(config.storageDir, "passport_valid_addresses.json"),
    JSON.stringify(validAddresses)
  );
}

async function loop() {
  await getScoresAndWrite(config);

  // loop every minute
  setTimeout(loop, 60 * 1000);
}

if (args.follow) {
  await loop();
} else {
  await getScoresAndWrite(config);
}
