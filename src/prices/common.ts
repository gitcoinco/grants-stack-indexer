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
