import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import { EMBEDDING_DIMENSIONS, embedText } from "../src/lib/embeddings";
import {
  closestSessionsPipeline,
  isVectorSearchEnabled,
  moodText,
  sessionMemory,
  VECTOR_INDEX_NAME,
} from "../src/services/sessionMemory";

// A stub stands in for Gemini. Local MongoDB has no $vectorSearch, so these tests
// check the pipeline we send, not the ranking Atlas would return.
const GEMINI_KEY = "gemini-key-in-a-header";

let gemini: http.Server;
let seen: { url?: string; key?: string; body?: any };
let dimensions = EMBEDDING_DIMENSIONS;

before(async () => {
  gemini = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen = {
        url: req.url,
        key: req.headers["x-goog-api-key"] as string,
        body: JSON.parse(raw),
      };
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          embeddings: [{ values: Array(dimensions).fill(0.1) }],
        }),
      );
    });
  });
  await new Promise<void>((r) => gemini.listen(0, r));
  process.env.GEMINI_API_BASE_URL = `http://127.0.0.1:${(gemini.address() as AddressInfo).port}`;
  process.env.GEMINI_API_KEY = GEMINI_KEY;
});

beforeEach(() => {
  seen = {};
  dimensions = EMBEDDING_DIMENSIONS;
  delete process.env.VECTOR_SEARCH;
});

after(() => {
  gemini.closeAllConnections();
  gemini.close();
});

describe("embeddings", () => {
  test("asks for 768 dimensions with the key in a header", async () => {
    const values = await embedText("Feeling: Calm", "RETRIEVAL_QUERY");
    assert.equal(values.length, 768);
    assert.equal(seen.key, GEMINI_KEY);
    assert.ok(!seen.url?.includes(GEMINI_KEY));
    assert.ok(seen.url?.includes("gemini-embedding-001"));
    assert.ok(JSON.stringify(seen.body).includes('"outputDimensionality":768'));
    assert.ok(JSON.stringify(seen.body).includes("RETRIEVAL_QUERY"));
  });

  test("refuses a vector the index cannot compare", async () => {
    dimensions = 3072;
    await assert.rejects(
      embedText("Feeling: Calm", "RETRIEVAL_QUERY"),
      /768 dimensions/,
    );
  });
});

describe("the search pipeline", () => {
  const [search, project] = closestSessionsPipeline("user1", [0.1, 0.2], 3) as [
    { $vectorSearch: any },
    { $project: any },
  ];

  test("only searches this user's sessions", () => {
    assert.deepEqual(search.$vectorSearch.filter, { userId: { $eq: "user1" } });
  });

  test("looks at many more candidates than it returns", () => {
    assert.equal(search.$vectorSearch.limit, 3);
    assert.equal(search.$vectorSearch.numCandidates, 60);
  });

  test("never sends the vector back", () => {
    assert.equal(project.$project.embedding, undefined);
    assert.deepEqual(project.$project.score, { $meta: "vectorSearchScore" });
  });

  test("matches the index file Atlas is given", () => {
    const index = JSON.parse(
      fs.readFileSync("atlas/meditation-session-vector-index.json", "utf8"),
    );
    const [vector, filter] = index.definition.fields;
    assert.equal(index.name, VECTOR_INDEX_NAME);
    assert.equal(search.$vectorSearch.index, index.name);
    assert.equal(search.$vectorSearch.path, vector.path);
    assert.equal(vector.numDimensions, EMBEDDING_DIMENSIONS);
    assert.equal(filter.path, "userId");
  });
});

describe("when vector search is off", () => {
  const mood = { selectedFeelings: ["Calm"], selectedEmojis: ["🙂"] };

  test("nothing calls Gemini or the database", async () => {
    assert.equal(isVectorSearchEnabled(), false);
    assert.deepEqual(await sessionMemory.findClosest("user1", mood), []);
    await sessionMemory.save({
      ...mood,
      userId: "user1",
      generatedScripts: "Breathe",
      videoKey: "videos/a.mp4",
    });
    assert.deepEqual(seen, {});
  });

  test("a saved mood and a new request embed the same text", () => {
    assert.equal(moodText(mood), "Feeling: Calm. Emojis: 🙂");
  });
});
