/** Converts a token amount (fixed point as a bigint) to a fiat currency amount (number)
 * @param args.tokenAmount The token amount
 * @param args.tokenDecimals The token decimals
 * @param args.tokenPrice The price of the token to fiat
 * @param args.tokenPriceDecimals The decimal places to use for the price, defaults to 8, any decimals beyond this will be truncated
 * @returns The currency amount
 * */
export function convertTokenToFiat(args: {
  tokenAmount: bigint;
  tokenDecimals: number;
  tokenPrice: number;
  tokenPriceDecimals: number;
}): number {
  const priceDecimalFactor = Math.pow(10, args.tokenPriceDecimals);
  const fixedPointPrice = BigInt(
    Math.trunc(args.tokenPrice * priceDecimalFactor)
  );

  const tokenDecimalFactor = 10n ** BigInt(args.tokenDecimals);

  return (
    Number((args.tokenAmount * fixedPointPrice) / tokenDecimalFactor) /
    priceDecimalFactor
  );
}

/** Converts a fiat amount (number) to a token amount (fixed point as a bigint)
 * @param args.currency The currency amount
 * @param args.tokenPrice The price of the token to fiat
 * @param args.tokenPriceDecimals The decimal places to use for the price, defaults to 8, any decimals beyond this will be truncated
 * @param args.tokenDecimals The decimals of the token we converting to
 * @returns The token amount
 * */
export function convertFiatToToken(args: {
  fiatAmount: number;
  tokenDecimals: number;
  tokenPrice: number;
  tokenPriceDecimals: number;
}): bigint {
  if (args.fiatAmount === 0) {
    return 0n;
  }

  const priceDecimalFactor = Math.pow(10, args.tokenPriceDecimals);

  const fiatAmountBigInt = BigInt(
    Math.trunc((args.fiatAmount / args.tokenPrice) * priceDecimalFactor)
  );

  const tokenDecimalFactor = 10n ** BigInt(args.tokenDecimals);

  return (fiatAmountBigInt * tokenDecimalFactor) / BigInt(priceDecimalFactor);
}
