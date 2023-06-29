import { ContractInterface } from "ethers";

export async function importAbi(path: string): Promise<ContractInterface> {
  // this will throw if file doesn't exist
  const importResult = (await import(path, {
    assert: { type: "json" },
  })) as { default: ContractInterface };

  return importResult.default;
}
