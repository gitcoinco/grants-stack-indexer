import TTLCache from "@isaacs/ttlcache";
import { AggregatedContributions } from "pluralistic";

export interface RoundContributionsCacheKey {
  chainId: number;
  roundId: string;
}

export class RoundContributionsCache {
  private cache: TTLCache<string, AggregatedContributions>;

  constructor() {
    this.cache = new TTLCache<string, AggregatedContributions>({
      ttl: 5 * 60 * 1000, // 5 minutes
      max: 10, // keep a maximum of 10 rounds in memory
    });
  }

  async getCalculationForRound(
    key: RoundContributionsCacheKey
  ): Promise<AggregatedContributions | undefined> {
    return await this.cache.get(`${key.roundId}-${key.chainId}`);
  }

  setCalculationForRound({
    roundId,
    chainId,
    contributions,
  }: RoundContributionsCacheKey & {
    contributions: AggregatedContributions;
  }): void {
    this.cache.set(`${roundId}-${chainId}`, contributions);
  }
}
