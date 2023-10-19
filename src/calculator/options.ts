export type ProportionalMatchOptions = {
  score: {
    min: number;
    max: number;
  };
  matchProportionPercentage: {
    min: number;
    max: number;
  };
};

export const defaultProportionalMatchOptions: ProportionalMatchOptions = {
  score: {
    min: 15,
    max: 25,
  },
  matchProportionPercentage: {
    min: 50,
    max: 100,
  },
};
