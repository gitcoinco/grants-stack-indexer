import { DeprecatedRound } from "../deprecatedJsonDatabase.js";

export interface CalculationConfig {
  minimumAmountUSD?: number;
  enablePassport?: boolean;
  matchingCapAmount?: bigint;
  matchAmount: bigint;
  ignoreSaturation?: boolean;
}

export function overrideCalculationConfig(
  config: CalculationConfig,
  overrides: Partial<CalculationConfig>
): CalculationConfig {
  return {
    minimumAmountUSD: overrides.minimumAmountUSD ?? config.minimumAmountUSD,
    enablePassport: overrides.enablePassport ?? config.enablePassport,
    matchingCapAmount: overrides.matchingCapAmount ?? config.matchingCapAmount,
    matchAmount: overrides.matchAmount ?? config.matchAmount,
    ignoreSaturation: overrides.ignoreSaturation ?? config.ignoreSaturation,
  };
}

export function extractCalculationConfigFromRound(
  round: DeprecatedRound
): CalculationConfig {
  const matchAmount = BigInt(round.matchAmount);

  let matchingCapAmount: bigint | undefined = undefined;

  if (round.metadata?.quadraticFundingConfig?.matchingCapAmount !== undefined) {
    // round.metadata.quadraticFundingConfig.matchingCapAmount is a percentage,
    // from 0 to 100, and can have decimals
    const capPercentage =
      round.metadata?.quadraticFundingConfig?.matchingCapAmount ?? 0;

    // convert the capAmount to a big int (50.5% becomes 5050, 50.00005% becomes 5000)
    const scaledCapPercentage = BigInt(Math.trunc(Number(capPercentage) * 100));

    matchingCapAmount = (matchAmount * scaledCapPercentage) / 10000n;
  }

  const enablePassport =
    round?.metadata?.quadraticFundingConfig?.sybilDefense === undefined
      ? undefined
      : Boolean(round?.metadata?.quadraticFundingConfig?.sybilDefense);

  const minimumAmountUSD =
    round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount ===
    undefined
      ? undefined
      : Number(
          round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount
        );

  return {
    minimumAmountUSD,
    enablePassport,
    matchAmount,
    matchingCapAmount,
  };
}
