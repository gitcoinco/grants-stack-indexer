import { describe, test, expect } from "vitest";
import { convertTokenToFiat, convertFiatToToken } from "./tokenMath.js";
import { warn } from "console";

describe("tokenMath", () => {
  test("token amount to currency", () => {
    expect(
      convertTokenToFiat({
        tokenAmount: 3400000000000000000n,
        tokenDecimals: 18,
        price: 1,
        priceDecimals: 8,
      })
    ).toBe(3.4);

    expect(
      convertTokenToFiat({
        tokenAmount: 50000000000n,
        tokenDecimals: 18,
        price: 1,
        priceDecimals: 8,
      })
    ).toBe(0.00000005);

    expect(
      convertTokenToFiat({
        tokenAmount: 3400000000000000000n,
        tokenDecimals: 18,
        price: 0.5,
        priceDecimals: 8,
      })
    ).toBe(1.7);

    expect(
      convertTokenToFiat({
        tokenAmount: 3400000000000000000n,
        tokenDecimals: 18,
        price: 2,
        priceDecimals: 8,
      })
    ).toBe(6.8);
  });

  test("currency to token amount", () => {
    expect(
      convertFiatToToken({
        fiatAmount: 3.4,
        price: 1,
        priceDecimals: 8,
        tokenDecimals: 18,
      })
    ).toBe(3400000000000000000n);

    expect(
      convertFiatToToken({
        fiatAmount: 3.4,
        price: 0.5,
        priceDecimals: 8,
        tokenDecimals: 18,
      })
    ).toBe(1700000000000000000n);

    expect(
      convertFiatToToken({
        fiatAmount: 3.4,
        price: 2,
        priceDecimals: 8,
        tokenDecimals: 18,
      })
    ).toBe(6800000000000000000n);

    expect(
      convertFiatToToken({
        fiatAmount: 10,
        price: 1e-9,
        priceDecimals: 12,
        tokenDecimals: 18,
      })
    ).toBe(10000000000n);
  });
});
