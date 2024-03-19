type Strategy = {
  id: string;
  name: string | null;
  groups: string[];
};

export function extractStrategyFromId(_id: string): Strategy | null {
  const id = _id.toLowerCase();
  /* eslint-disable no-fallthrough */
  switch (id) {
    // SQFSuperfluidv1
    case "0xf8a14294e80ff012e54157ec9d1b2827421f1e7f6bde38c06730b1c031b3f935":
      return {
        id: id,
        name: "allov2.SQFSuperFluidStrategy",
        groups: ["allov2.SQFSuperFluidStrategy"],
      };

    // MicroGrantsv1
    case "0x697f0592ebd05466d2d24454477e11d69c475d7a7c4134f15ddc1ea9811bb16f":
      return {
        id: id,
        name: "allov2.MicroGrantsStrategy",
        groups: ["allov2.MicroGrantsStrategy", "allov2.MicroGrantsCommon"],
      };

    // MicroGrantsGovv1
    case "0x741ac1e2f387d83f219f6b5349d35ec34902cf94019d117335e0045d2e0ed912":
      return {
        id: id,
        name: "allov2.MicroGrantsGovStrategy",
        groups: ["allov2.MicroGrantsGovStrategy", "allov2.MicroGrantsCommon"],
      };

    // MicroGrantsHatsv1
    case "0x5aa24dcfcd55a1e059a172e987b3456736b4856c71e57aaf52e9a965897318dd":
      return {
        id: id,
        name: "allov2.MicroGrantsHatsStrategy",
        groups: ["allov2.MicroGrantsHatsStrategy", "allov2.MicroGrantsCommon"],
      };

    // RFPSimpleStrategyv1.0
    case "0x0d459e12d9e91d2b2a8fa12be8c7eb2b4f1c35e74573990c34b436613bc2350f":
      return {
        id: id,
        name: "allov2.RFPSimpleStrategy",
        groups: ["allov2.RFPSimpleStrategy"],
      };

    // RFPCommitteeStrategyv1.0
    case "0x7d143166a83c6a8a303ae32a6ccd287e48d79818f5d15d89e185391199909803":
      return {
        id: id,
        name: "allov2.RFPCommitteeStrategy",
        groups: ["allov2.RFPCommitteeStrategy"],
      };

    // QVSimpleStrategyv1.0
    case "0x22d006e191d6dc5ff1a25bb0733f47f64a9c34860b6703df88dea7cb3987b4c3":
      return {
        id: id,
        name: "allov2.QVSimpleStrategy",
        groups: ["allov2.QVSimpleStrategy"],
      };

    // DonationVotingMerkleDistributionDirectTransferStrategyv1.0
    case "0x6f9291df02b2664139cec5703c124e4ebce32879c74b6297faa1468aa5ff9ebf":
    // DonationVotingMerkleDistributionDirectTransferStrategyv1.1
    case "0x2f46bf157821dc41daa51479e94783bb0c8699eac63bf75ec450508ab03867ce":
    // DonationVotingMerkleDistributionDirectTransferStrategyv2.0
    case "0x2f0250d534b2d59b8b5cfa5eb0d0848a59ccbf5de2eaf72d2ba4bfe73dce7c6b":
    // DonationVotingMerkleDistributionDirectTransferStrategyv2.0
    case "0x9fa6890423649187b1f0e8bf4265f0305ce99523c3d11aa36b35a54617bb0ec0":
      return {
        id: id,
        name: "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
        groups: [
          "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
        ],
      };

    // DonationVotingMerkleDistributionVaultStrategyv1.0
    case "0x7e75375f0a7cd9f7ea159c8b065976e4f764f9dcef1edf692f31dd1842f70c87":
    // DonationVotingMerkleDistributionVaultStrategyv1.1
    case "0x093072375737c0e8872fef36808849aeba7f865e182d495f2b98308115c9ef13":
      return {
        id: id,
        name: "allov2.DonationVotingMerkleDistributionVaultStrategy",
        groups: ["allov2.DonationVotingMerkleDistributionVaultStrategy"],
      };

    // DirectGrantsSimpleStrategyv1.1
    case "0x263cb916541b6fc1fb5543a244829ccdba75264b097726e6ecc3c3cfce824bf5":
    // DirectGrantsSimpleStrategyv2.1
    case "0x53fb9d3bce0956ca2db5bb1441f5ca23050cb1973b33789e04a5978acfd9ca93":
      return {
        id: id,
        name: "allov2.DirectGrantsSimpleStrategy",
        groups: ["allov2.DirectGrantsSimpleStrategy"],
      };
  }

  return null;
}
