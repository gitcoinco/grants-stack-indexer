import { Chain } from "../config.js";
import type { Vote } from "../indexer/types.js";

enum ChainId {
  Fantom = 250,
}

type TokenAddress = Lowercase<`0x${string}`>;

type TokensSettings = {
  [chainId in ChainId]: {
    [tokenAddress: TokenAddress]: {
      voteAmountCap: bigint | undefined;
    };
  };
};

export const FANTOM_GCV: TokenAddress =
  "0x83791638da5eb2faa432aff1c65fba47c5d29510";

// For now this mapping contains one single token.
// We can continue adding tokens here, but in the future it will
// be better to save the voteAmountCap in the roundMetadata and having
// this fields editable in Grants Stack.
export const tokensSettings: TokensSettings = {
  250: {
    [FANTOM_GCV]: {
      voteAmountCap: BigInt(10e18),
    },
  },
};

export function applyVoteCap(chain: Chain, vote: Vote): Vote {
  const tokenConfig = chain.tokens.find(
    (t) => t.address.toLowerCase() === vote.token.toLowerCase()
  );

  if (tokenConfig === undefined) {
    throw new Error(`Unknown token: ${vote.token}`);
  }

  const { voteAmountCap } = tokenConfig;
  if (voteAmountCap === undefined) {
    return vote;
  } else {
    // amount : amountRoundToken = voteAmountCap : newAmountRoundToken
    const newAmountRoundToken =
      (BigInt(vote.amountRoundToken) * voteAmountCap) / BigInt(vote.amount);

    return {
      ...vote,
      amountRoundToken: newAmountRoundToken.toString(),
    };
  }
}
