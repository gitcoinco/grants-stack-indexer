// TODO: why is eslint not recognizing type narrowing?
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
export function encodeJsonWithBigInts(value: unknown): string {
  return JSON.stringify(value, (_key, value) => {
    if (typeof value === "bigint") {
      return { type: "bigint", value: value.toString() };
    }
    return value as unknown;
  });
}

export function decodeJsonWithBigInts<T>(encodedJson: string): T {
  return JSON.parse(encodedJson, (_key, value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === "bigint" &&
      "value" in value &&
      typeof value.value === "string"
    ) {
      return BigInt(value.value);
    }
    return value as unknown;
  }) as T;
}
