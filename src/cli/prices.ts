import { ethers } from "ethers";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import config from "../config.js";
import { getPrice, tokens } from "../coinGecko.js";

const lastDate = new Date(2023, 0, 1);

const { values } = parseArgs({
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
  },
});

async function getPricesAndWrite(dir: string) {
  const now = new Date();

  for (const token of tokens) {
    const prices = await getPrice(
      token.address,
      token.chainId,
      lastDate.getTime(),
      now.getTime()
    );

    console.log(prices);

    // await fs.mkdir(dir, { recursive: true });
    // await fs.writeFile(
    //   path.join(dir, "passport_scores.json"),
    //   JSON.stringify(scores)
    // );
    // await fs.writeFile(
    //   path.join(dir, "passport_valid_addresses.json"),
    //   JSON.stringify(validAddresses)
    // );
  }
}

async function loop() {
  await getPricesAndWrite(config.storageDir);

  setTimeout(loop, 60 * 60 * 1000);
}

if (values.follow) {
  await loop();
} else {
  await getPricesAndWrite(config.storageDir);
}
