import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import helmet from "helmet";
import {
  fileIdFromVeoUri,
  isValidFileId,
  streamVeoVideo,
  videoPath,
} from "../src/lib/geminiVideo";

const KEY = "test-key-never-in-a-url";
const BODY = Buffer.alloc(1024 * 1024, 7);

let google: http.Server;
let api: http.Server;
let apiUrl: string;
let seen: { url?: string; key?: string; range?: string; closedEarly: boolean };

const listen = (server: http.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, () => resolve((server.address() as AddressInfo).port)),
  );

before(async () => {
  google = http.createServer((req, res) => {
    seen.url = req.url;
    seen.key = req.headers["x-goog-api-key"] as string;
    seen.range = req.headers.range;
    res.on("close", () => {
      if (!res.writableEnded) seen.closedEarly = true;
    });
    if (req.url?.includes("missing")) {
      res.statusCode = 404;
      return res.end("gone");
    }
    if (req.url?.includes("broken")) {
      res.statusCode = 500;
      return res.end(`upstream detail ${KEY}`);
    }
    if (req.url?.includes("slow")) {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.write(BODY.subarray(0, 1024));
      return;
    }
    if (req.headers.range) {
      res.writeHead(206, {
        "content-type": "video/mp4",
        "content-range": `bytes 0-9/${BODY.length}`,
        "content-length": "10",
      });
      return res.end(BODY.subarray(0, 10));
    }
    res.writeHead(200, {
      "content-type": "video/mp4",
      "content-length": String(BODY.length),
      "accept-ranges": "bytes",
    });
    res.end(BODY);
  });
  const googlePort = await listen(google);

  const app = express();
  app.use(helmet());
  app.get("/video/:fileId", (req, res) => {
    void streamVeoVideo({
      fileId: req.params.fileId,
      range: req.headers.range,
      res,
      apiKey: KEY,
      baseUrl: `http://127.0.0.1:${googlePort}`,
    });
  });
  api = http.createServer(app);
  apiUrl = `http://127.0.0.1:${await listen(api)}`;
});

beforeEach(() => {
  seen = { closedEarly: false };
});

after(() => {
  google.closeAllConnections();
  api.closeAllConnections();
  google.close();
  api.close();
});

test("reads only the file id from a Veo link", () => {
  const uri =
    "https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media";
  assert.equal(fileIdFromVeoUri(uri), "abc123");
  assert.equal(fileIdFromVeoUri(encodeURIComponent(uri)), "abc123");
  assert.equal(fileIdFromVeoUri("https://example.com/no-file"), null);
});

test("rejects file ids that could change the upstream path", () => {
  for (const bad of ["../secrets", "a/b", "a?b", "a:b", "", "x".repeat(129)]) {
    assert.equal(isValidFileId(bad), false, bad);
  }
  assert.equal(isValidFileId("abc_123-XYZ"), true);
});

test("the public link holds no key", () => {
  assert.equal(videoPath("abc123"), "/api/script/video/abc123");
});

test("sends the key as a header and never in the url", async () => {
  const res = await fetch(`${apiUrl}/video/abc123`);
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200);
  assert.equal(body.length, BODY.length);
  assert.equal(seen.key, KEY);
  assert.ok(!seen.url?.includes(KEY));
  assert.equal(res.headers.get("content-type"), "video/mp4");
});

test("the video tag can load it from another origin", async () => {
  const res = await fetch(`${apiUrl}/video/abc123`);
  await res.arrayBuffer();
  assert.equal(res.headers.get("cross-origin-resource-policy"), "cross-origin");
});

test("forwards range requests so viewers can seek", async () => {
  const res = await fetch(`${apiUrl}/video/abc123`, {
    headers: { range: "bytes=0-9" },
  });
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 206);
  assert.equal(seen.range, "bytes=0-9");
  assert.equal(body.length, 10);
  assert.equal(res.headers.get("content-range"), `bytes 0-9/${BODY.length}`);
});

test("an expired file returns a clear 404", async () => {
  const res = await fetch(`${apiUrl}/video/missing`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { message: "Video is no longer available" });
});

test("an upstream failure never passes its body to the client", async () => {
  const res = await fetch(`${apiUrl}/video/broken`);
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.ok(!text.includes(KEY));
});

test("closing the tab cancels the download from Google", async () => {
  const abort = new AbortController();
  const res = await fetch(`${apiUrl}/video/slow`, { signal: abort.signal });
  const reader = res.body!.getReader();
  await reader.read();
  abort.abort();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(seen.closedEarly, true);
});
