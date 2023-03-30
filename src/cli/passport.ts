import { ethers } from "ethers";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import config from "../config.js";
import { filterPassportByEvidence, getPassportScores } from "../passport.js";

const { values } = parseArgs({
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
  },
});

async function getScoresAndWrite(dir: string) {
  const scores = await getPassportScores();

  const validAddresses = filterPassportByEvidence(scores).map((passport) => {
    return ethers.utils.getAddress(passport.address);
  });

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "passport_scores.json"),
    JSON.stringify(scores)
  );
  await fs.writeFile(
    path.join(dir, "passport_valid_addresses.json"),
    JSON.stringify(validAddresses)
  );
}

async function loop() {
  await getScoresAndWrite(config.storageDir);

  setTimeout(loop, 60 * 60 * 1000);
}

if (values.follow) {
  await loop();
} else {
  await getScoresAndWrite(config.storageDir);
}
