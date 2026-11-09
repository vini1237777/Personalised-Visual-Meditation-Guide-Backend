import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import type { SQSEvent } from "aws-lambda";
import type { GenerationResult } from "../src/services/meditationGenerator";

// A throwaway local MongoDB and a stub queue. No AI service is reached: generation
// here is a fake function, and the API only ever queues.
const PORT = 3978;
const MONGO_PORT = 27096;
const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/soulsync_jobs_test`;
const SECRET = "jobs-test-secret";
const BASE = `http://127.0.0.1:${PORT}`;
const MINUTE = 60 * 1000;

let mongod: ChildProcess;
let api: ChildProcess;
let queue: http.Server;
let dbPath: string;
let sent: string[] = [];
let queueBroken = false;
let aliceId: string;
let bobId: string;
let GenerationJob: typeof import("../src/models/generationJobModel").default;
let User: typeof import("../src/models/userModel").default;
let runJob: typeof import("../src/services/jobRunner").runJob;
let createHandler: typeof import("../src/lambda/createHandler").createHandler;

const tokenFor = (id: string) => jwt.sign({ sub: id }, SECRET, { expiresIn: "5m" });
const request = { selectedFeelings: ["Calm"], selectedEmojis: ["🙂"] };

const post = (id: string) =>
  fetch(`${BASE}/api/script/post`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenFor(id)}`,
    },
    body: JSON.stringify(request),
  });

const getJob = (jobId: string, id: string) =>
  fetch(`${BASE}/api/script/jobs/${jobId}`, {
    headers: { authorization: `Bearer ${tokenFor(id)}` },
  });

const newJob = async (fields: Record<string, unknown> = {}) =>
  String(
    (
      await GenerationJob.create({
        userId: aliceId,
        apiUrl: "http://api.test",
        ...request,
        ...fields,
      })
    )._id,
  );

const statusOf = async (jobId: string) =>
  (await GenerationJob.findById(jobId))?.status;

const counting = (result: GenerationResult = { generatedScripts: "Breathe" }) => {
  const fake = async () => {
    fake.calls++;
    return result;
  };
  fake.calls = 0;
  return fake;
};

const sqsEvent = (...bodies: string[]): SQSEvent =>
  ({
    Records: bodies.map((body, i) => ({ messageId: `m${i}`, body })),
  }) as unknown as SQSEvent;

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
  process.env.GEMINI_API_KEY = "not-used";
  process.env.OPENAI_API_KEY = "not-used";
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), "soulsync-jobs-"));
  mongod = spawn(
    "mongod",
    ["--dbpath", dbPath, "--port", String(MONGO_PORT), "--bind_ip", "127.0.0.1", "--quiet"],
    { stdio: "ignore" },
  );
  await waitFor(async () => {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 500 });
    return true;
  });

  GenerationJob = (await import("../src/models/generationJobModel")).default;
  User = (await import("../src/models/userModel")).default;
  ({ runJob } = await import("../src/services/jobRunner"));
  ({ createHandler } = await import("../src/lambda/createHandler"));

  const [alice, bob] = await User.create([
    { fullName: "Alice", email: "alice@example.com", password: "x".repeat(12) },
    { fullName: "Bob", email: "bob@example.com", password: "x".repeat(12) },
  ]);
  aliceId = String(alice!._id);
  bobId = String(bob!._id);

  queue = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/x-amz-json-1.0");
      if (queueBroken) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ __type: "QueueDoesNotExist" }));
      }
      const body = JSON.parse(raw).MessageBody;
      sent.push(body);
      res.end(
        JSON.stringify({
          MessageId: "1",
          MD5OfMessageBody: createHash("md5").update(body).digest("hex"),
        }),
      );
    });
  });
  await new Promise<void>((r) => queue.listen(0, r));
  const queuePort = (queue.address() as AddressInfo).port;

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
      SQS_QUEUE_URL: `http://127.0.0.1:${queuePort}/000000000000/jobs`,
      S3_VIDEO_BUCKET: "soulsync-videos",
      AWS_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "test-access",
      AWS_SECRET_ACCESS_KEY: "test-secret",
    },
  });
  await waitFor(async () => {
    await fetch(`${BASE}/api/script/post`, { method: "OPTIONS" });
    return true;
  });
});

beforeEach(async () => {
  sent = [];
  queueBroken = false;
  await GenerationJob.deleteMany({});
});

after(async () => {
  api?.kill("SIGKILL");
  queue?.closeAllConnections();
  queue?.close();
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  mongod?.kill("SIGKILL");
  fs.rmSync(dbPath, { recursive: true, force: true });
});

describe("delivering a job more than once", () => {
  test("two deliveries at once generate one video", async () => {
    const jobId = await newJob();
    const fake = counting();
    const outcomes = await Promise.all([runJob(jobId, fake), runJob(jobId, fake)]);
    assert.equal(fake.calls, 1);
    assert.deepEqual([...outcomes].sort(), ["finished", "skipped"]);
  });

  test("a late repeat of a finished job does nothing", async () => {
    const jobId = await newJob();
    const fake = counting();
    await runJob(jobId, fake);
    assert.equal(await runJob(jobId, fake), "skipped");
    assert.equal(fake.calls, 1);
  });

  test("a repeat is skipped while a worker is still running it", async () => {
    const jobId = await newJob({ status: "running", startedAt: new Date() });
    const fake = counting();
    assert.equal(await runJob(jobId, fake), "skipped");
    assert.equal(fake.calls, 0);
  });

  test("a job left behind by a crashed worker runs again", async () => {
    const jobId = await newJob({
      status: "running",
      attempts: 1,
      startedAt: new Date(Date.now() - 17 * MINUTE),
    });
    const fake = counting();
    assert.equal(await runJob(jobId, fake), "finished");
    assert.equal(fake.calls, 1);
    assert.equal((await GenerationJob.findById(jobId))?.attempts, 2);
  });
});

describe("running a job", () => {
  test("saves the result on the job and the key on the user", async () => {
    const jobId = await newJob();
    await runJob(
      jobId,
      counting({ generatedScripts: "Breathe", videoKey: "videos/a/b.mp4" }),
    );
    const job = await GenerationJob.findById(jobId);
    assert.equal(job?.status, "done");
    assert.equal(job?.videoKey, "videos/a/b.mp4");
    const user = await User.findById(aliceId);
    assert.equal(user?.videoKey, "videos/a/b.mp4");
  });

  test("a failed generation is recorded and not retried", async () => {
    const jobId = await newJob();
    const outcome = await runJob(jobId, async () => {
      throw new Error("Veo refused the prompt");
    });
    assert.equal(outcome, "failed");
    assert.equal(await statusOf(jobId), "failed");
  });
});

describe("the Lambda handler", () => {
  test("runs the job in the message", async () => {
    const jobId = await newJob();
    const fake = counting();
    const res = await createHandler(fake)(sqsEvent(JSON.stringify({ jobId })));
    assert.deepEqual(res.batchItemFailures, []);
    assert.equal(fake.calls, 1);
    assert.equal(await statusOf(jobId), "done");
  });

  test("a failed generation does not go back on the queue", async () => {
    const jobId = await newJob();
    const res = await createHandler(async () => {
      throw new Error("nope");
    })(sqsEvent(JSON.stringify({ jobId })));
    assert.deepEqual(res.batchItemFailures, []);
  });

  test("a database failure retries only that message", async () => {
    const good = await newJob();
    const bad = String(new mongoose.Types.ObjectId());
    const res = await createHandler(counting(), async (jobId) => {
      if (jobId === bad) throw new Error("database down");
      return "finished";
    })(sqsEvent(JSON.stringify({ jobId: good }), JSON.stringify({ jobId: bad })));
    assert.deepEqual(res.batchItemFailures, [{ itemIdentifier: "m1" }]);
  });

  test("an unreadable message is dropped", async () => {
    const fake = counting();
    const res = await createHandler(fake)(
      sqsEvent("not json", JSON.stringify({ jobId: "$ne" })),
    );
    assert.deepEqual(res.batchItemFailures, []);
    assert.equal(fake.calls, 0);
  });
});

describe("starting a job", () => {
  test("answers 202 straight away and queues the job", async () => {
    const res = await post(aliceId);
    assert.equal(res.status, 202);
    const { jobId } = await res.json();
    assert.deepEqual(sent, [JSON.stringify({ jobId })]);
    assert.equal(await statusOf(jobId), "queued");
  });

  test("a second click returns the same job and queues nothing", async () => {
    const first = await (await post(aliceId)).json();
    const second = await post(aliceId);
    assert.equal(second.status, 202);
    assert.equal((await second.json()).jobId, first.jobId);
    assert.equal(sent.length, 1);
  });

  test("a job stuck past its limit does not block a new one", async () => {
    const stuck = await newJob({
      status: "running",
      startedAt: new Date(Date.now() - 17 * MINUTE),
    });
    const { jobId } = await (await post(aliceId)).json();
    assert.notEqual(jobId, stuck);
  });

  test("a queue outage says so and leaves no job waiting", async () => {
    queueBroken = true;
    const res = await post(aliceId);
    assert.equal(res.status, 503);
    assert.equal(await GenerationJob.countDocuments({ status: "queued" }), 0);
    assert.equal(await GenerationJob.countDocuments({ status: "failed" }), 1);
  });
});

describe("checking a job", () => {
  test("shows progress with no result", async () => {
    const res = await getJob(await newJob(), aliceId);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "queued" });
  });

  test("signs a fresh link when the video is in S3", async () => {
    const jobId = await newJob({
      status: "done",
      generatedScripts: "Breathe",
      videoKey: "videos/a/b.mp4",
    });
    const body = await (await getJob(jobId, aliceId)).json();
    assert.equal(body.status, "done");
    assert.equal(body.generatedScripts, "Breathe");
    const link = new URL(body.videoUrl);
    assert.ok(link.pathname.endsWith("videos/a/b.mp4"));
    assert.ok(link.searchParams.get("X-Amz-Signature"));
    assert.ok(!("videoKey" in body));
  });

  test("returns the streaming link when the copy had failed", async () => {
    const jobId = await newJob({
      status: "done",
      generatedScripts: "Breathe",
      videoUrl: "http://api.test/api/script/video/abc",
    });
    const body = await (await getJob(jobId, aliceId)).json();
    assert.equal(body.videoUrl, "http://api.test/api/script/video/abc");
  });

  test("another user cannot see it", async () => {
    const res = await getJob(await newJob(), bobId);
    assert.equal(res.status, 404);
  });

  test("a bad id is a 404, and no token is a 401", async () => {
    assert.equal((await getJob("not-an-id", aliceId)).status, 404);
    const res = await fetch(`${BASE}/api/script/jobs/${await newJob()}`);
    assert.equal(res.status, 401);
  });
});
