import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { mkdirSync } from "node:fs";

export class Cache {
  private dir: string;
  private loading: Record<string, Promise<unknown>>;
  private isDisabled: boolean;

  constructor(dir: string, isDisabled = false) {
    this.dir = dir;
    this.loading = {};
    this.isDisabled = isDisabled;

    if (!this.isDisabled) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private key(key: string) {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  private filename(key: string) {
    return path.join(this.dir, this.key(key));
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.isDisabled) {
      return undefined;
    }

    const filename = this.filename(key);

    try {
      return JSON.parse((await fs.readFile(filename)).toString()) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown) {
    if (this.isDisabled) {
      return;
    }

    const filename = this.filename(key);

    try {
      await fs.writeFile(filename, JSON.stringify(value));
    } catch {
      return undefined;
    }
  }

  lazy<T>(key: string, fun: () => Promise<T>): Promise<T> {
    if (this.loading[key] !== undefined) {
      return this.loading[key] as Promise<T>;
    }

    this.loading[key] = this.get<T>(key).then((cachedValue) => {
      if (cachedValue) {
        return cachedValue;
      } else {
        const promise = fun();

        void promise.then((value) => {
          return this.set(key, value);
        });

        return promise;
      }
    });

    void this.loading[key].then(() => {
      delete this.loading[key];
    });

    return this.loading[key] as Promise<T>;
  }
}
