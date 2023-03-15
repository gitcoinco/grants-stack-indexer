import fetch from "node-fetch";

function wait(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function fetchJson<T>(cid: string, retries = 5): Promise<T> {
  // TODO: wth is this?
  if (cid === "test_pointer") {
    return undefined as T;
  }

  if (!cid) {
    throw new Error(`Invalid IPFS CID: ${cid}`);
  }

  let attempt = 0;

  while (attempt < retries) {
    try {
      const res = await fetch(`https://cloudflare-ipfs.com/ipfs/${cid}`);
      return (await res.json()) as T;
    } catch (e) {
      attempt = attempt + 1;
      await wait(attempt * 500);
      console.log("[IPFS] Retrying:", cid, "Attempt:", attempt);
    }
  }

  throw new Error(`IPFS not found: ${cid}`);
}
