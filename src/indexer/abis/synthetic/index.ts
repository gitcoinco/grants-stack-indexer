import * as v2 from "../v2/index.js";
import * as v3 from "../v3/index.js";

// TODO: provide background

export const QuadraticFundingVotingStrategyImplementation = (() => {
  const VotedEventV3 = v3.QuadraticFundingVotingStrategyImplementation.find(
    (entry) => entry.name === "Voted"
  );

  if (VotedEventV3 === undefined) {
    throw new Error(
      "Could not create synthetic QuadraticFundingVotingStrategyImplementation: event not found in source ABI"
    );
  }

  return [...v2.QuadraticFundingVotingStrategyImplementation, VotedEventV3];
})();
