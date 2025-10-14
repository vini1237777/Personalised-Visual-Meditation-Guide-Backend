import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import "dotenv/config";

import { userRoutes } from "./routes/userRoutes";
import { authRoutes } from "./routes/authRoutes";
import { scriptRoutes } from "./routes/scriptGenerator";

import { Readable, pipeline } from "node:stream";
import { promisify } from "node:util";
const pipe = promisify(pipeline);

const app = express();

app.get("/media", async (req, res) => {
  const upstream = await fetch(String(req.query.url || ""), {
    headers: req.headers.range ? { Range: String(req.headers.range) } : {},
  });

  res.status(upstream.status);
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Content-Type": upstream.headers.get("content-type") || "video/mp4",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
    "Content-Range": upstream.headers.get("content-range") || undefined,
    "Content-Length": upstream.headers.get("content-length") || undefined,
    "X-Content-Type-Options": "nosniff",
  });

  const body = upstream.body;
  if (!body) return res.end();

  const nodeStream = Readable.fromWeb(body as unknown as ReadableStream);
  await pipe(nodeStream, res); // handles errors/abort nicely
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = Number(process.env.PORT) || 3000;

app.use(
  cors({
    origin: [
      "http://localhost:4000",
      "http://localhost:3000",
      "https://www.meditateaurelia.fit",
      "https://meditateaurelia.fit",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/script", scriptRoutes);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.log("MONGODB_URI is not set. API will run, DB will be DOWN.");
} else {
  mongoose
    .connect(mongoUri, {})
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Error connecting to MongoDB:", err));
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

export default app;
