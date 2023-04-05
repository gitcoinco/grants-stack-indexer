import fetchRetry from "./fetchRetry.js";

export async function fetchJson<T>(cid: string): Promise<T> {
  // TODO: wth is this?
  if (cid === "test_pointer") {
    return undefined as T;
  }

  if (!cid) {
    throw new Error(`Invalid IPFS CID: ${cid}`);
  }

  const res = await fetchRetry(`https://cloudflare-ipfs.com/ipfs/${cid}`, {
    retries: 10,
    backoff: 1000,
  });

  const data = await res.json();

  return data;
}
