export type Address = `0x${string}` & { __brand: "Address" };

class InvalidAddress extends Error {
  constructor(address: string) {
    super(`Invalid address: ${address}`);
  }
}

export function safeParseAddress(address: string): Address | null {
  if (address.startsWith("0x") === false) {
    return null;
  }

  if (address.length !== 42) {
    return null;
  }

  return address.toLowerCase() as Address;
}

export function parseAddress(address: string): Address {
  const parsed = safeParseAddress(address);
  if (!parsed) {
    throw new InvalidAddress(address);
  }
  return parsed;
}
