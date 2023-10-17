/** Converts a token amount to a currency amount
 * @param args.tokenAmount The token amount
 * @param args.tokenDecimals The token decimals
 * @param args.price The price of the token
 * @param args.priceDecimals The decimal places to use for the price, defaults to 8, any decimals beyond this will be truncated
 * @returns The currency amount
 * */
export function convertTokenToFiat(args: {
  tokenAmount: bigint;
  tokenDecimals: number;
  price: number;
  priceDecimals: number;
}): number {
  const priceDecimalFactor = Math.pow(10, args.priceDecimals);
  const fixedPointPrice = BigInt(Math.trunc(args.price * priceDecimalFactor));

  const tokenDecimalFactor = 10n ** BigInt(args.tokenDecimals);

  return (
    Number((args.tokenAmount * fixedPointPrice) / tokenDecimalFactor) /
    priceDecimalFactor
  );
}

/** Converts a currency amount to a token amount
 * @param args.currency The currency amount
 * @param args.price The price of the currency
 * @param args.priceDecimals The decimal places to use for the price, defaults to 8, any decimals beyond this will be truncated
 * @param args.tokenDecimals The decimals of the token we converting to
 * @returns The token amount
 * */
export function convertFiatToToken(args: {
  fiatAmount: number;
  price: number;
  tokenDecimals: number;
  priceDecimals: number;
}): bigint {
  const priceDecimalFactor = Math.pow(10, args.priceDecimals);

  const fiatAmountBigInt = BigInt(
    Math.trunc(args.fiatAmount * args.price * priceDecimalFactor)
  );

  const tokenDecimalFactor = 10n ** BigInt(args.tokenDecimals);

  return (fiatAmountBigInt * tokenDecimalFactor) / BigInt(priceDecimalFactor);
}
