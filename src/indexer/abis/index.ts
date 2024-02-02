// V1.1
import ProjectRegistryV1 from "./allo-v1/v1/ProjectRegistry.js";
import RoundFactoryV1 from "./allo-v1/v1/RoundFactory.js";
import RoundImplementationV1 from "./allo-v1/v1/RoundImplementation.js";
import QuadraticFundingVotingStrategyFactoryV1 from "./allo-v1/v1/QuadraticFundingVotingStrategyFactory.js";
import QuadraticFundingVotingStrategyImplementationV1 from "./allo-v1/v1/QuadraticFundingVotingStrategyImplementation.js";
import ProgramFactoryV1 from "./allo-v1/v1/ProgramFactory.js";
import ProgramImplementationV1 from "./allo-v1/v1/ProgramImplementation.js";

// V1.2
import ProjectRegistryV2 from "./allo-v1/v2/ProjectRegistry.js";
import RoundFactoryV2 from "./allo-v1/v2/RoundFactory.js";
import RoundImplementationV2 from "./allo-v1/v2/RoundImplementation.js";
import QuadraticFundingVotingStrategyFactoryV2 from "./allo-v1/v2/QuadraticFundingVotingStrategyFactory.js";
import QuadraticFundingVotingStrategyImplementationV2 from "./allo-v1/v2/QuadraticFundingVotingStrategyImplementation.js";
import DirectPayoutStrategyFactoryV2 from "./allo-v1/v2/DirectPayoutStrategyFactory.js";
import DirectPayoutStrategyImplementationV2 from "./allo-v1/v2/DirectPayoutStrategyImplementation.js";

// V2
import AlloV2 from "./allo-v2/v1/Allo.js";
import AlloV2Registry from "./allo-v2/v1/Registry.js";

const abis = {
  "AlloV1/ProjectRegistry/V1": ProjectRegistryV1,
  "AlloV1/ProjectRegistry/V2": ProjectRegistryV2,
  "AlloV1/ProgramFactory/V1": ProgramFactoryV1,
  "AlloV1/ProgramImplementation/V1": ProgramImplementationV1,
  "AlloV1/RoundFactory/V1": RoundFactoryV1,
  "AlloV1/RoundImplementation/V1": RoundImplementationV1,
  "AlloV1/QuadraticFundingVotingStrategyFactory/V1":
    QuadraticFundingVotingStrategyFactoryV1,
  "AlloV1/QuadraticFundingVotingStrategyImplementation/V1":
    QuadraticFundingVotingStrategyImplementationV1,
  "AlloV1/RoundFactory/V2": RoundFactoryV2,
  "AlloV1/RoundImplementation/V2": RoundImplementationV2,
  "AlloV1/QuadraticFundingVotingStrategyFactory/V2":
    QuadraticFundingVotingStrategyFactoryV2,
  "AlloV1/QuadraticFundingVotingStrategyImplementation/V2":
    QuadraticFundingVotingStrategyImplementationV2,
  "AlloV1/DirectPayoutStrategyFactory/V2": DirectPayoutStrategyFactoryV2,
  "AlloV1/DirectPayoutStrategyImplementation/V2":
    DirectPayoutStrategyImplementationV2,

  "AlloV2/Allo/V1": AlloV2,
  "AlloV2/Registry/V1": AlloV2Registry,
} as const;

export default abis;
export type ContractName = keyof typeof abis;
