import { describe, beforeEach, test, afterEach, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { Document } from "../database.js";
import { createJsonDatabase } from "./json.js";

type User = Document & {
  name: string;
  email: string;
};

async function readJSON(path: string): Promise<unknown> {
  const content = await fs.readFile(path, "utf-8");
  return JSON.parse(content) as unknown;
}

describe("JsonDatabase", () => {
  let dbDir: string;

  function createDatabase() {
    return createJsonDatabase({ dir: dbDir, writeDelay: 0 });
  }

  beforeEach(async () => {
    dbDir = await fs.mkdtemp(path.join(os.tmpdir(), "db-"));
  });

  afterEach(() => {
    setTimeout(() => fs.rm(dbDir, { recursive: true }), 1000);
  });

  test("insert and findById", async () => {
    const db = createDatabase();
    const users = db.collection<User>("users1");

    await users.insert({ id: "1", name: "Alice", email: "alice@example.com" });
    await users.insert({ id: "2", name: "Bob", email: "bob@example.com" });

    const user = await users.findById("1");

    expect(user).toEqual({
      id: "1",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  test("parallel insert and findById", async () => {
    const db = createDatabase();
    const users = db.collection<User>("users2");

    await users.insert({ id: "1", name: "Alice", email: "alice@example.com" });
    await users.insert({ id: "2", name: "Bob", email: "bob@example.com" });

    const user = await users.findById("1");

    expect(user).toEqual({
      id: "1",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  test("updateById", async () => {
    const db = createDatabase();
    const users = db.collection<User>("users3");

    await users.insert({ id: "1", name: "Alice", email: "alice@example.com" });

    const updatedUser = await users.updateById("1", (user) => ({
      ...user,
      name: "Alicia",
    }));

    expect(updatedUser).toEqual({
      id: "1",
      name: "Alicia",
      email: "alice@example.com",
    });
  });

  test("upsertById", async () => {
    const db = createDatabase();
    const users = db.collection<User>("users4");

    const isNew = await users.upsertById("1", (user) => {
      expect(user).toBeNull();

      return {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
      };
    });

    expect(isNew).toBe(true);

    const isNew2 = await users.upsertById("1", (user) => {
      expect(user).not.toBeNull();

      return {
        name: "Alice",
        email: "alice@example.com",
      };
    });

    expect(isNew2).toBe(false);

    const user = await users.findById("1");

    expect(user).toEqual({
      id: "1",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  test("all", async () => {
    const db = createDatabase();
    const users = db.collection<User>("users5");

    await users.insert({ id: "1", name: "Alice", email: "alice@example.com" });
    await users.insert({ id: "2", name: "Bob", email: "bob@example.com" });

    const allUsers = await users.all();
    expect(allUsers).toEqual([
      { id: "1", name: "Alice", email: "alice@example.com" },
      { id: "2", name: "Bob", email: "bob@example.com" },
    ]);
  });

  test("writes JSON files", async () => {
    // test write delay code path
    const db = createJsonDatabase({ dir: dbDir, writeDelay: 200 });
    const users = db.collection<User>("sub/users6");

    await users.insert({ id: "1", name: "Alice", email: "alice@example.com" });

    // wait for the write delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const dbData = await readJSON(path.join(dbDir, "sub/users6.json"));

    expect(dbData).toEqual([
      {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
      },
    ]);
  });

  test("concurrent writes", async () => {
    // test write delay code path
    const db = createJsonDatabase({ dir: dbDir, writeDelay: 200 });
    const users = db.collection<User>("sub/users7");

    await Promise.all([
      users.insert({ id: "1", name: "Alice", email: "alice@example.com" }),
      users.insert({ id: "2", name: "Bob", email: "bob@example.com" }),
    ]);

    // wait for the write delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const dbData = await readJSON(path.join(dbDir, "sub/users7.json"));

    expect(dbData).toEqual([
      {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
      },
      {
        id: "2",
        name: "Bob",
        email: "bob@example.com",
      },
    ]);
  });
});
