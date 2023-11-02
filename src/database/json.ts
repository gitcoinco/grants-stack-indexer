import fs from "node:fs/promises";
import path from "node:path";
import { debounce } from "throttle-debounce";
import fastq from "fastq";

import { Collection, Database, Document } from "../database.js";

function buildIndex<T extends Document>(data: T[]): { [key: string]: number } {
  const index: { [key: string]: number } = {};

  for (let i = 0; i < data.length; i++) {
    index[data[i].id] = i;
  }

  return index;
}

type Index = { [key: string]: number };

async function loadJsonData<T extends Document>(
  filename: string,
  decodeJson: (data: string) => unknown = JSON.parse
): Promise<{ data: T[]; index: Index }> {
  let fileContents: string = "[]";

  try {
    fileContents = await fs.readFile(filename, "utf-8");
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      // file not found, return empty data
      return { data: [], index: {} };
    }

    throw err;
  }

  const data = decodeJson(fileContents) as T[];
  const index = buildIndex(data);

  return { data, index };
}

type Operation<T> = {
  type: "query" | "modify";
  execute: (args: { data: T[]; index: Index }) => unknown;
};

interface LoadedState<T> {
  type: "loaded";
  data: T[];
  index: Index;
  isModified: boolean;
}

interface EmptyState {
  type: "empty";
}

interface ReadingFromDiskState<T> {
  type: "readingFromDisk";
  promise: Promise<LoadedState<T>>;
}

interface WritingToDiskState {
  type: "writingToDisk";
  promise: Promise<void>;
}

type State<T> =
  | EmptyState
  | LoadedState<T>
  | ReadingFromDiskState<T>
  | WritingToDiskState;

class JsonCollection<T extends Document> implements Collection<T> {
  private filename: string;
  private state: State<T> = { type: "empty" };
  private encodeJson: (data: unknown) => string;
  private decodeJson: (data: string) => unknown;
  private enqueueWrite: (task: () => Promise<void>) => Promise<void>;
  private queue: fastq.queueAsPromised<Operation<T>>;

  constructor(
    filename: string,
    options: {
      queueWrite: (task: () => Promise<void>) => Promise<void>;
      writeDelay?: number;
      encodeJson?: (data: unknown) => string;
      decodeJson?: (data: string) => unknown;
    }
  ) {
    this.filename = filename;
    this.enqueueWrite = options.queueWrite;
    this.encodeJson = options.encodeJson ?? JSON.stringify;
    this.decodeJson = options.decodeJson ?? JSON.parse;

    const scheduleSave = debounce(options.writeDelay ?? 0, () => {
      void this.enqueueWrite(async () => {
        if (this.state.type !== "loaded") {
          return;
        }

        // if we haven't made any changes, don't write to disk
        if (this.state.isModified === false) {
          this.state = {
            type: "empty",
          };
          return;
        }

        const data = this.state.data;

        const promise = fs
          .mkdir(path.dirname(filename), {
            recursive: true,
          })
          .then(() => fs.writeFile(this.filename, this.encodeJson(data)))
          .finally(() => {
            this.state = {
              type: "empty",
            };
          });

        this.state = {
          type: "writingToDisk",
          promise,
        };

        return promise;
      });
    });

    this.queue = fastq.promise(async (op) => {
      switch (op.type) {
        case "query": {
          const { data, index } = await this.load();
          const result = op.execute({ data, index });
          scheduleSave();
          return result;
        }
        case "modify": {
          const state = await this.load();
          const result = op.execute({ data: state.data, index: state.index });
          state.isModified = true;
          scheduleSave();
          return result;
        }
      }
    }, 1);
  }

  private async load(): Promise<LoadedState<T>> {
    if (this.state.type === "loaded") {
      return this.state;
    } else if (this.state.type === "readingFromDisk") {
      return this.state.promise;
    } else if (this.state.type === "empty") {
      this.state = {
        type: "readingFromDisk",
        promise: loadJsonData<T>(this.filename, this.decodeJson).then(
          (data) => {
            this.state = {
              type: "loaded",
              data: data.data,
              index: data.index,
              isModified: false,
            };
            return this.state;
          }
        ),
      };
      return this.state.promise;
    } else if (this.state.type === "writingToDisk") {
      await this.state.promise;
      return this.load();
    }

    throw new Error("Invalid state");
  }

  private executeQueryOperation<R>(
    operation: (args: { data: T[]; index: Index }) => R
  ): Promise<R> {
    return this.queue.push({ type: "query", execute: operation }) as Promise<R>;
  }

  private executeModifyOperation<R>(
    operation: (args: { data: T[]; index: Index }) => R
  ): Promise<R> {
    return this.queue.push({
      type: "modify",
      execute: operation,
    }) as Promise<R>;
  }

  async insert(document: T): Promise<T> {
    if (typeof document !== "object") {
      throw new Error("Document must be an object");
    }

    return this.executeModifyOperation(({ data, index }) => {
      data.push(document);
      index[document.id] = data.length - 1;

      return document;
    });
  }

  async findById(id: string): Promise<T | null> {
    return this.executeQueryOperation(({ data, index }) => {
      return data[index[id]] ?? null;
    });
  }

  async updateById(id: string, fun: (doc: T) => T): Promise<T | null> {
    return this.executeModifyOperation(({ data, index }) => {
      if (index[id] === undefined) {
        return null;
      }

      const updatedRecord = fun(data[index[id]]);
      data[index[id]] = { ...updatedRecord, id: data[index[id]].id };

      return data[index[id]];
    });
  }

  // returns true it inserted a new record
  async upsertById(id: string, fun: (doc: T | null) => T): Promise<boolean> {
    return this.executeModifyOperation(({ data, index }) => {
      const isNewDocument = index[id] === undefined;

      if (isNewDocument) {
        const document = fun(null);
        data.push(document);
        index[document.id] = data.length - 1;
      } else {
        const updatedRecord = fun(data[index[id]]);
        data[index[id]] = { ...updatedRecord, id: data[index[id]].id };
      }

      return isNewDocument;
    });
  }

  async all(): Promise<T[]> {
    return this.executeQueryOperation(({ data }) => {
      return data;
    });
  }
}

const DEFAULT_MAX_CONCURRENT_WRITES = 10;

export interface Options {
  dir: string;
  maxConcurrentWrites?: number;
  writeDelay?: number;
  encodeJson?: (data: unknown) => string;
  decodeJson?: (data: string) => unknown;
}

export function createJsonDatabase(options: Options): Database {
  const collections: Record<string, Collection<Document>> = {};
  const writeQueue = fastq.promise(async (task: () => Promise<void>) => {
    await task();
  }, options.maxConcurrentWrites ?? DEFAULT_MAX_CONCURRENT_WRITES);

  return {
    flushWrites: async () => {
      // await for any delayed writes to be queued
      await new Promise((resolve) =>
        setTimeout(resolve, options.writeDelay ?? 0)
      );

      // await for the queue to be drained
      await writeQueue.drained();

      return;
    },
    collection<T extends Document>(name: string): Collection<T> {
      if (collections[name] === undefined) {
        const filename = path.join(options.dir, `${name}.json`);
        collections[name] = new JsonCollection(filename, {
          queueWrite: (args) => writeQueue.push(args),
          writeDelay: options.writeDelay,
          encodeJson: options.encodeJson,
          decodeJson: options.decodeJson,
        });
      }

      return collections[name] as Collection<T>;
    },
  };
}
