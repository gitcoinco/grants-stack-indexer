// V1
import ProjectRegistryV1 from "./v1/ProjectRegistry.js";
import RoundFactoryV1 from "./v1/RoundFactory.js";
import RoundImplementationV1 from "./v1/RoundImplementation.js";
import QuadraticFundingVotingStrategyFactoryV1 from "./v1/QuadraticFundingVotingStrategyFactory.js";
import QuadraticFundingVotingStrategyImplementationV1 from "./v1/QuadraticFundingVotingStrategyImplementation.js";

// v2
import ProjectRegistryV2 from "./v2/ProjectRegistry.js";
import RoundFactoryV2 from "./v2/RoundFactory.js";
import RoundImplementationV2 from "./v2/RoundImplementation.js";
import QuadraticFundingVotingStrategyFactoryV2 from "./v2/QuadraticFundingVotingStrategyFactory.js";
import QuadraticFundingVotingStrategyImplementationV2 from "./v2/QuadraticFundingVotingStrategyImplementation.js";
import DirectPayoutStrategyFactoryV2 from "./v2/DirectPayoutStrategyFactory.js";
import DirectPayoutStrategyImplementationV2 from "./v2/DirectPayoutStrategyImplementation.js";

export default {
  ProjectRegistryV1: ProjectRegistryV1,
  RoundFactoryV1: RoundFactoryV1,
  RoundImplementationV1: RoundImplementationV1,
  QuadraticFundingVotingStrategyFactoryV1:
    QuadraticFundingVotingStrategyFactoryV1,
  QuadraticFundingVotingStrategyImplementationV1:
    QuadraticFundingVotingStrategyImplementationV1,
  ProjectRegistryV2: ProjectRegistryV2,
  RoundFactoryV2: RoundFactoryV2,
  RoundImplementationV2: RoundImplementationV2,
  QuadraticFundingVotingStrategyFactoryV2:
    QuadraticFundingVotingStrategyFactoryV2,
  QuadraticFundingVotingStrategyImplementationV2:
    QuadraticFundingVotingStrategyImplementationV2,
  DirectPayoutStrategyFactoryV2: DirectPayoutStrategyFactoryV2,
  DirectPayoutStrategyImplementationV2: DirectPayoutStrategyImplementationV2,
} as const;
