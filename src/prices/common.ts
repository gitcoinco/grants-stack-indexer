export const minutes = (n: number) => n * 60 * 1000;
export const hours = (n: number) => minutes(60) * n;
export const days = (n: number) => hours(24) * n;

export class UnknownTokenError extends Error {
  public constructor(
    public address: string,
    public chainId: number,
    message?: string
  ) {
    super(message ?? `Token ${address} not configured for chain ${chainId}`);
    this.name = new.target.name;
  }
}
