export type ProportionalMatchOptions = {
  score: {
    min: bigint;
    max: bigint;
  };
  matchProportionPercentage: {
    min: bigint;
    max: bigint;
  };
};

export const defaultProportionalMatchOptions: ProportionalMatchOptions = {
  score: {
    min: 15n,
    max: 25n,
  },
  matchProportionPercentage: {
    min: 0n,
    max: 100n,
  },
};
