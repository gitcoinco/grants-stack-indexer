import { Cache } from "chainsauce";

import fetchRetry from "./fetchRetry.js";
import config from "../config.js";

export async function fetchJsonCached<T>(
  cid: string,
  cache: Cache
): Promise<T> {
  return await cache.lazy<T>(`ipfs-${cid}`, () => fetchJson<T>(cid));
}

export async function fetchJson<T>(cid: string): Promise<T> {
  // TODO: wth is this?
  if (cid === "test_pointer") {
    return undefined as T;
  }

  if (!cid) {
    throw new Error(`Invalid IPFS CID: ${cid}`);
  }

  const res = await fetchRetry(`${config.ipfsGateway}/ipfs/${cid}`, {
    retries: 10,
    backoff: 1000,
  });

  const data = await res.json();

  return data;
}
