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
      const res = await fetch(input);
      console.debug("[fetch] Fetching", input);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res;
    } catch (e) {
      attempt = attempt + 1;
      await wait(attempt * backoff);
      console.warn("[fetch] Retrying", input, "attempt:", attempt, e);
    }
  }

  throw new Error(`Failed to fetch ${input} after ${attempt} attempts`);
}
