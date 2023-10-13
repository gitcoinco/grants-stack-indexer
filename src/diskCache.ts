import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// A simple disk cache that stores JSON-serializable values.
// This class is deprecated and will be removed, do not use for new code.
export class DeprecatedDiskCache {
  private dir: string;
  private initializePromise: Promise<void> | null;

  constructor(dir: string) {
    this.dir = dir;
    this.initializePromise = null;
  }

  private filename(key: string) {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    return path.join(this.dir, hash);
  }

  async ensureInitialized() {
    if (this.initializePromise === null) {
      this.initializePromise = fs
        .mkdir(this.dir, { recursive: true })
        .then(() => {
          return;
        });
    }
    return this.initializePromise;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureInitialized();
    const filename = this.filename(key);

    let fileContents;

    try {
      fileContents = await fs.readFile(filename, "utf-8");
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "ENOENT"
      ) {
        return null;
      } else {
        throw err;
      }
    }

    return JSON.parse(fileContents) as T;
  }

  async set(key: string, value: unknown) {
    await this.ensureInitialized();
    const filename = this.filename(key);

    await fs.writeFile(filename, JSON.stringify(value));
  }

  async lazy<T>(key: string, fun: () => Promise<T>): Promise<T> {
    await this.ensureInitialized();

    return this.get<T>(key).then((cachedValue) => {
      if (cachedValue !== null) {
        return cachedValue;
      } else {
        const promise = fun();

        void promise.then((value) => {
          return this.set(key, value);
        });

        return promise;
      }
    });
  }
}
