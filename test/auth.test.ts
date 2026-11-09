import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// Runs the real app against a throwaway local MongoDB. Nothing here reaches a live
// service: the AI keys are fake, and generation never runs because these tests
// only send requests that must stop at the auth and validation checks.
const PORT = 3977;
const MONGO_PORT = 27097;
const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/soulsync_test`;
const SECRET = "auth-test-secret";
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "correct-password";

let mongod: ChildProcess;
let api: ChildProcess;
let dbPath: string;
let users: mongoose.mongo.Collection;
let aliceId: string;
let bobId: string;

const send = (method: string, url: string, body?: unknown, token?: string) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const tokenFor = (id: string, roles = ["user"]) =>
  jwt.sign({ sub: id, roles }, SECRET, { expiresIn: "5m" });

async function waitFor(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out");
}

before(async () => {
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), "soulsync-test-"));
  mongod = spawn(
    "mongod",
    ["--dbpath", dbPath, "--port", String(MONGO_PORT), "--bind_ip", "127.0.0.1", "--quiet"],
    { stdio: "ignore" },
  );
  await waitFor(async () => {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 500 });
    return true;
  });
  users = mongoose.connection.collection("users");
  await users.deleteMany({});
  const hash = await bcrypt.hash(PASSWORD, 4);
  const inserted = await users.insertMany([
    { fullName: "Alice", email: "alice@example.com", password: hash, roles: ["user"] },
    { fullName: "Bob", email: "bob@example.com", password: hash, roles: ["user"] },
  ]);
  aliceId = inserted.insertedIds[0].toString();
  bobId = inserted.insertedIds[1].toString();

  api = spawn("node", ["--require", "ts-node/register", "src/app.ts"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      TS_NODE_TRANSPILE_ONLY: "1",
      PORT: String(PORT),
      MONGODB_URI: MONGO_URI,
      JWT_ACCESS_SECRET: SECRET,
      GEMINI_API_KEY: "not-used",
      OPENAI_API_KEY: "not-used",
    },
  });
  await waitFor(async () => {
    await fetch(`${BASE}/api/script/post`, { method: "OPTIONS" });
    return true;
  });
});

after(async () => {
  api?.kill("SIGKILL");
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  mongod?.kill("SIGKILL");
  fs.rmSync(dbPath, { recursive: true, force: true });
});

describe("auth responses", () => {
  test("login never returns the password hash", async () => {
    const res = await send("POST", "/api/auth/login", {
      email: "alice@example.com",
      password: PASSWORD,
    });
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.ok(!text.includes('"password"'), "password field in response");
    assert.ok(!text.includes("$2b$"), "bcrypt hash in response");
    assert.ok(JSON.parse(text).token);
  });

  test("a wrong password is refused", async () => {
    const res = await send("POST", "/api/auth/login", {
      email: "alice@example.com",
      password: "wrong-password",
    });
    assert.equal(res.status, 400);
  });

  test("signing up works, and returns no hash", async () => {
    const res = await send("POST", "/api/auth/register", {
      fullName: "Carol",
      email: "carol@example.com",
      password: "long-enough-password",
      confirmPassword: "long-enough-password",
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    assert.ok(!text.includes('"password"'), "password field in response");
    assert.ok(!text.includes("$2b$"), "bcrypt hash in response");
  });
});

describe("new accounts", () => {
  test("someone who signs up can log in with the same password", async () => {
    const credentials = { email: "dave@example.com", password: "long-enough-password" };
    const signup = await send("POST", "/api/auth/register", {
      fullName: "Dave",
      ...credentials,
    });
    assert.equal(signup.status, 201);
    const login = await send("POST", "/api/auth/login", credentials);
    assert.equal(login.status, 200);
  });
});

describe("generation route", () => {
  const body = { selectedFeelings: ["Calm"], selectedEmojis: ["🙂"] };

  test("refuses a request with no token", async () => {
    const res = await send("POST", "/api/script/post", {
      ...body,
      email: "alice@example.com",
    });
    assert.equal(res.status, 401);
  });

  test("refuses a forged token", async () => {
    const forged = jwt.sign({ sub: aliceId }, "another-secret");
    const res = await send("POST", "/api/script/post", body, forged);
    assert.equal(res.status, 401);
  });

  test("refuses a body with no feelings before any model call", async () => {
    const res = await send(
      "POST",
      "/api/script/post",
      { selectedFeelings: [], selectedEmojis: [] },
      tokenFor(aliceId),
    );
    assert.equal(res.status, 400);
  });

  test("refuses a huge body before any model call", async () => {
    const res = await send(
      "POST",
      "/api/script/post",
      { selectedFeelings: Array(500).fill("x".repeat(100)), selectedEmojis: [] },
      tokenFor(aliceId),
    );
    assert.equal(res.status, 400);
  });
});

describe("video link", () => {
  test("needs a login", async () => {
    const res = await fetch(`${BASE}/api/script/video-link`);
    assert.equal(res.status, 401);
  });

  test("says so when there is no saved video", async () => {
    const res = await fetch(`${BASE}/api/script/video-link`, {
      headers: { authorization: `Bearer ${tokenFor(aliceId)}` },
    });
    assert.equal(res.status, 404);
  });
});

describe("user routes", () => {
  test("reads the signed in user, whatever email is sent", async () => {
    const res = await fetch(`${BASE}/api/user/get`, {
      headers: { authorization: `Bearer ${tokenFor(aliceId)}` },
    });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    assert.ok(text.includes("alice@example.com"));
    assert.ok(!text.includes("bob@example.com"));
    assert.ok(!text.includes("$2b$"), "bcrypt hash in response");
  });

  test("a user cannot make themselves an admin", async () => {
    const res = await send(
      "PUT",
      `/api/user/update/${aliceId}`,
      { fullName: "Alice B", roles: ["admin"], password: "plain" },
      tokenFor(aliceId),
    );
    const text = await res.text();
    assert.ok(!text.includes("$2b$"), "bcrypt hash in response");
    const stored = await users.findOne({ _id: new mongoose.Types.ObjectId(aliceId) });
    assert.deepEqual(stored?.roles, ["user"]);
    assert.notEqual(stored?.password, "plain");
    assert.equal(stored?.fullName, "Alice B");
  });

  test("a user cannot update someone else", async () => {
    const res = await send(
      "PUT",
      `/api/user/update/${bobId}`,
      { fullName: "Hacked" },
      tokenFor(aliceId),
    );
    assert.equal(res.status, 403);
    const stored = await users.findOne({ _id: new mongoose.Types.ObjectId(bobId) });
    assert.equal(stored?.fullName, "Bob");
  });
});
