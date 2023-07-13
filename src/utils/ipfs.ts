import fetchRetry from "./fetchRetry.js";

const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9A-Za-z]{50,})$/;

export async function fetchJson<T>(
  cid: string,
  config: { ipfsGateway: string }
): Promise<T | undefined> {
  if (!cidRegex.test(cid)) {
    console.error("Invalid IPFS CID:", cid);
    return undefined;
  }

  if (!cid) {
    throw new Error(`Invalid IPFS CID: ${cid}`);
  }

  const res = await fetchRetry(`${config.ipfsGateway}/ipfs/${cid}`, {
    retries: 10,
    backoff: 1000,
  });

  const data = (await res.json()) as T;

  return data;
}
