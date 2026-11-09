import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";

const GEMINI_KEY = "gemini-key-never-sent-to-s3";
const AWS_SECRET = "aws-secret-never-in-a-link";
const MB = 1024 * 1024;

let google: http.Server;
let s3: http.Server;
let googleSeen: { key?: string; url?: string };
let videoBytes: number;
let googleStatus = 200;
let stored: { method: string; url: string; bytes: number; type?: string }[];

const listen = (server: http.Server) =>
  new Promise<number>((r) =>
    server.listen(0, () => r((server.address() as AddressInfo).port)),
  );

before(async () => {
  google = http.createServer((req, res) => {
    googleSeen = {
      key: req.headers["x-goog-api-key"] as string,
      url: req.url,
    };
    res.statusCode = googleStatus;
    if (googleStatus !== 200) return res.end("nope");
    res.setHeader("content-type", "video/mp4");
    res.end(Buffer.alloc(videoBytes, 7));
  });

  // Answers just enough of the S3 protocol for one put or a multipart upload.
  s3 = http.createServer((req, res) => {
    let bytes = 0;
    req.on("data", (c) => (bytes += c.length));
    req.on("end", () => {
      stored.push({
        method: req.method ?? "",
        url: req.url ?? "",
        bytes,
        type: req.headers["content-type"],
      });
      const url = req.url ?? "";
      res.setHeader("content-type", "application/xml");
      if (req.method === "POST" && url.includes("uploads")) {
        return res.end(
          "<InitiateMultipartUploadResult><UploadId>up1</UploadId></InitiateMultipartUploadResult>",
        );
      }
      if (req.method === "POST") {
        return res.end(
          "<CompleteMultipartUploadResult><ETag>x</ETag></CompleteMultipartUploadResult>",
        );
      }
      res.setHeader("etag", '"x"');
      res.end();
    });
  });

  const [g, s] = await Promise.all([listen(google), listen(s3)]);
  process.env.GEMINI_FILES_BASE_URL = `http://127.0.0.1:${g}`;
  process.env.S3_ENDPOINT = `http://127.0.0.1:${s}`;
  process.env.S3_VIDEO_BUCKET = "soulsync-videos";
  process.env.AWS_REGION = "ap-south-1";
  process.env.AWS_ACCESS_KEY_ID = "test-access";
  process.env.AWS_SECRET_ACCESS_KEY = AWS_SECRET;
});

beforeEach(() => {
  stored = [];
  googleSeen = {};
  googleStatus = 200;
  videoBytes = MB;
});

after(() => {
  google.closeAllConnections();
  s3.closeAllConnections();
  google.close();
  s3.close();
});

const load = () => import("../src/lib/videoStorage");
const copy = async (userId = "user1") =>
  (await load()).copyVeoVideoToS3({ fileId: "abc123", userId, apiKey: GEMINI_KEY });

describe("copying to S3", () => {
  test("a small video is stored under its owner", async () => {
    const key = await copy("user42");
    assert.match(key, /^videos\/user42\/[\w-]+\.mp4$/);
    const put = stored.find((s) => s.method === "PUT");
    assert.ok(put?.url.includes(key));
    assert.equal(put?.type, "video/mp4");
    assert.ok(put && put.bytes >= MB);
  });

  test("a long video goes up in parts", async () => {
    videoBytes = 20 * MB;
    await copy();
    const parts = stored.filter(
      (s) => s.method === "PUT" && s.url.includes("partNumber"),
    );
    assert.equal(parts.length, 3);
    assert.ok(parts.every((p) => p.bytes <= 8.1 * MB));
    assert.ok(stored.some((s) => s.method === "POST" && s.url.includes("uploadId")));
  });

  test("the Gemini key goes in a header and never reaches S3", async () => {
    await copy();
    assert.equal(googleSeen.key, GEMINI_KEY);
    assert.ok(!googleSeen.url?.includes(GEMINI_KEY));
    assert.ok(stored.every((s) => !s.url.includes(GEMINI_KEY)));
  });

  test("an expired Veo file stores nothing", async () => {
    googleStatus = 404;
    await assert.rejects(copy(), /status 404/);
    assert.equal(stored.length, 0);
  });
});

describe("presigned links", () => {
  test("expire in an hour and hold no secret", async () => {
    const { presignVideo } = await load();
    const url = new URL(await presignVideo("videos/user1/a.mp4"));
    assert.equal(url.searchParams.get("X-Amz-Expires"), "3600");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.ok(url.pathname.endsWith("/videos/user1/a.mp4"));
    assert.ok(!url.href.includes(AWS_SECRET));
    assert.ok(!url.href.includes(GEMINI_KEY));
  });

  test("two keys never share a signature", async () => {
    const { presignVideo } = await load();
    const a = new URL(await presignVideo("videos/user1/a.mp4"));
    const b = new URL(await presignVideo("videos/user2/a.mp4"));
    assert.notEqual(
      a.searchParams.get("X-Amz-Signature"),
      b.searchParams.get("X-Amz-Signature"),
    );
  });
});
