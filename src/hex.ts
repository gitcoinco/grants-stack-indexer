import { Hex } from "./types.js";

class InvalidHexString extends Error {
  constructor(hexString: string) {
    super(`Invalid hex string: ${hexString}`);
  }
}

export function parseHex(hexString: string): Hex {
  const pattern = /^0x[0-9A-Fa-f]+$/;
  if (!pattern.test(hexString)) {
    throw new InvalidHexString(hexString);
  }

  return hexString.toLowerCase() as Hex;
}
