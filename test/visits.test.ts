import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import mongoose from "mongoose";

const PORT = 3979;
const MONGO_PORT = 27095;
const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/soulsync_visits_test`;
const BROWSER = "Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36";

let mongod: ChildProcess;
let api: ChildProcess;
let dbPath: string;

const visit = async (ip: string, userAgent = BROWSER) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/visits`, {
    method: "POST",
    headers: { "x-forwarded-for": ip, "user-agent": userAgent },
  });
  assert.equal(res.status, 200);
  return (await res.json()).visitors as number;
};

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
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), "soulsync-visits-"));
  mongod = spawn(
    "mongod",
    ["--dbpath", dbPath, "--port", String(MONGO_PORT), "--bind_ip", "127.0.0.1", "--quiet"],
    { stdio: "ignore" },
  );
  await waitFor(async () => {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 500 });
    return true;
  });
  api = spawn("node", ["--require", "ts-node/register", "src/app.ts"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      TS_NODE_TRANSPILE_ONLY: "1",
      PORT: String(PORT),
      MONGODB_URI: MONGO_URI,
      JWT_ACCESS_SECRET: "visits-test-secret",
      GEMINI_API_KEY: "not-used",
      OPENAI_API_KEY: "not-used",
    },
  });
  await waitFor(async () => {
    await visit("10.0.0.99");
    return true;
  });
});

beforeEach(async () => {
  await mongoose.connection.collection("visitors").deleteMany({});
});

after(async () => {
  api?.kill("SIGKILL");
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  mongod?.kill("SIGKILL");
  fs.rmSync(dbPath, { recursive: true, force: true });
});

describe("visitor count", () => {
  test("a repeat visit from one address counts once", async () => {
    assert.equal(await visit("10.0.0.1"), 1);
    assert.equal(await visit("10.0.0.1"), 1);
  });

  test("a new address adds one", async () => {
    await visit("10.0.0.1");
    assert.equal(await visit("10.0.0.2"), 2);
  });

  test("a bot reads the count without adding to it", async () => {
    await visit("10.0.0.1");
    assert.equal(await visit("10.0.0.3", "Googlebot/2.1"), 1);
    assert.equal(await visit("10.0.0.4", "Mozilla/5.0 HeadlessChrome/130.0"), 1);
  });

  test("the address itself is never stored", async () => {
    await visit("10.0.0.7");
    const [doc] = await mongoose.connection.collection("visitors").find().toArray();
    assert.match(String(doc?._id), /^[a-f\d]{64}$/);
    assert.ok(!JSON.stringify(doc).includes("10.0.0.7"));
  });
});
