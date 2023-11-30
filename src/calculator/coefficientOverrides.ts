export type CoefficientOverrides = Record<string, number>;
import csv from "csv-parser";
import { CalculatorError } from "./errors.js";

export class CoefficientOverridesColumnNotFoundError extends CalculatorError {
  constructor(column: string) {
    super(`cannot find column ${column} in the overrides file`);
  }
}

export class CoefficientOverridesInvalidRowError extends CalculatorError {
  constructor(row: number, message: string) {
    super(`Row ${row} in the overrides file is invalid: ${message}`);
  }
}

export function parseCoefficientOverridesCsv(
  buf: Buffer
): Promise<CoefficientOverrides> {
  return new Promise((resolve, _reject) => {
    const results: CoefficientOverrides = {};
    let rowIndex = 1;

    const stream = csv()
      .on("headers", (headers: string[]) => {
        if (headers.indexOf("id") < 0) {
          throw new CoefficientOverridesColumnNotFoundError("id");
        }

        if (headers.indexOf("coefficient") < 0) {
          throw new CoefficientOverridesColumnNotFoundError("coefficient");
        }
      })
      .on("data", (data: Record<string, string>) => {
        const coefficient = Number(data["coefficient"]);
        if (!Number.isFinite(coefficient)) {
          throw new CoefficientOverridesInvalidRowError(
            rowIndex,
            `Coefficient must be a number, found: ${data["coefficient"]}`
          );
        }

        results[data["id"]] = coefficient;
        rowIndex += 1;
      })
      .on("end", () => {
        resolve(results);
      });

    stream.write(buf);
    stream.end();
  });
}
