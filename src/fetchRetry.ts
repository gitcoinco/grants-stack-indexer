import { wait } from "./utils.js";

export type RequestOptions = {
  retries: number;
  backoff: number;
} & RequestInit;

export default async function fetchRetry(
  input: URL | string,
  init?: RequestOptions
): Promise<ReturnType<typeof fetch>> {
  let attempt = 0;
  const retries = init?.retries ?? 5;
  const backoff = init?.backoff ?? 1000;

  while (attempt < retries) {
    try {
      console.debug("[fetch] Fetching", input);
      const res = await fetch(input, init);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res;
    } catch (e) {
      attempt = attempt + 1;
      await wait(
        Math.floor(attempt * (Math.random() * (backoff * 0.5) + backoff * 0.5))
      );
      console.warn("[fetch] Retrying", input, "attempt:", attempt, e);
    }
  }

  throw new Error(`Failed to fetch ${input} after ${attempt} attempts`);
}
