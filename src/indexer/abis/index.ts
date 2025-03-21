// V1.1
import ProjectRegistryV1 from "../contracts/alloV1/projectRegistry/v1/abi/ProjectRegistry.js";
import RoundFactoryV1 from "./allo-v1/v1/RoundFactory.js";
import RoundImplementationV1 from "./allo-v1/v1/RoundImplementation.js";
import QuadraticFundingVotingStrategyFactoryV1 from "./allo-v1/v1/QuadraticFundingVotingStrategyFactory.js";
import QuadraticFundingVotingStrategyImplementationV1 from "./allo-v1/v1/QuadraticFundingVotingStrategyImplementation.js";
import ProgramFactoryV1 from "./allo-v1/v1/ProgramFactory.js";
import ProgramImplementationV1 from "./allo-v1/v1/ProgramImplementation.js";

// V1.2
import ProjectRegistryV2 from "../contracts/alloV1/projectRegistry/v2/abi/ProjectRegistry.js";
import RoundFactoryV2 from "./allo-v1/v2/RoundFactory.js";
import RoundImplementationV2 from "./allo-v1/v2/RoundImplementation.js";
import QuadraticFundingVotingStrategyFactoryV2 from "./allo-v1/v2/QuadraticFundingVotingStrategyFactory.js";
import QuadraticFundingVotingStrategyImplementationV2 from "./allo-v1/v2/QuadraticFundingVotingStrategyImplementation.js";
import DirectPayoutStrategyFactoryV2 from "./allo-v1/v2/DirectPayoutStrategyFactory.js";
import DirectPayoutStrategyImplementationV2 from "./allo-v1/v2/DirectPayoutStrategyImplementation.js";
import MerklePayoutStrategyFactory from "./allo-v1/v2/MerklePayoutStrategyFactory.js";
import MerklePayoutStrategyImplementation from "./allo-v1/v2/MerklePayoutStrategyImplementation.js";

// V2
import AlloV2 from "./allo-v2/v1/Allo.js";
import AlloV2Registry from "./allo-v2/v1/Registry.js";
import AlloV2IStrategy from "./allo-v2/v1/IStrategy.js";
import AlloV2DonationVotingMerkleDistributionDirectTransferStrategy from "./allo-v2/v1/DonationVotingMerkleDistributionDirectTransferStrategy.js";
import AlloV2DirectGrantsSimpleStrategy from "./allo-v2/v1/DirectGrantsSimpleStrategy.js";
import AlloV1ToV2ProfileMigration from "./allo-v2/AlloV1ToV2ProfileMigration.js";
import AlloV2DirectGrantsLiteStrategy from "./allo-v2/v1/DirectGrantsLiteStrategy.js";
import AlloV2EasyRPGFStrategy from "./allo-v2/v1/EasyRPGFStrategy.js";
import AlloV2DirectAllocationStrategy from "./allo-v2/v1/DirectAllocationStrategy.js";
import AlloV2EasyRetroFundingStrategy from "./allo-v2/v1/EasyRetroFundingStrategy.js";

// Gitcoin Attestation Network
import GitcoinAttestationNetwork from "./gitcoin-attestation-network/GitcoinGrantsResolver.js";

const abis = {
  // Allo V1
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
  "AlloV1/MerklePayoutStrategyFactory/V2": MerklePayoutStrategyFactory,
  "AlloV1/MerklePayoutStrategyImplementation/V2":
    MerklePayoutStrategyImplementation,

  // Allo V2 Profile Migration
  "AlloV2/AlloV1ToV2ProfileMigration": AlloV1ToV2ProfileMigration,

  // Allo V2 Registry
  "AlloV2/Registry/V1": AlloV2Registry,

  // Allo V2 Core
  "AlloV2/Allo/V1": AlloV2,
  "AlloV2/IStrategy/V1": AlloV2IStrategy,
  "AlloV2/DonationVotingMerkleDistributionDirectTransferStrategy/V1":
    AlloV2DonationVotingMerkleDistributionDirectTransferStrategy,
  "AlloV2/DirectGrantsSimpleStrategy/V1": AlloV2DirectGrantsSimpleStrategy,
  "AlloV2/DirectGrantsLiteStrategy/V1": AlloV2DirectGrantsLiteStrategy,
  "AlloV2/EasyRPGFStrategy/V1": AlloV2EasyRPGFStrategy,
  "AlloV2/DirectAllocationStrategy/V1": AlloV2DirectAllocationStrategy,
  "AlloV2/EasyRetroFundingStrategy/V1": AlloV2EasyRetroFundingStrategy,
  // Gitcoin Attestation Network
  "GitcoinAttestationNetwork/GitcoinGrantsResolver": GitcoinAttestationNetwork,
} as const;

export default abis;
export type ContractName = keyof typeof abis;
