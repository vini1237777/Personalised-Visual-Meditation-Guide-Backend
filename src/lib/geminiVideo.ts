import type { Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const FILE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const FORWARDED_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
];

export function isValidFileId(fileId: string): boolean {
  return FILE_ID.test(fileId);
}

// Veo returns a link like .../v1beta/files/abc123:download?alt=media.
// Only the file id leaves the server, so the link can never carry the key.
export function fileIdFromVeoUri(uri: string): string | null {
  const id = decodeURIComponent(uri).match(/\/files\/([^/:?]+)/)?.[1];
  return id && isValidFileId(id) ? id : null;
}

export function videoPath(fileId: string): string {
  return `/api/script/video/${fileId}`;
}

type StreamOptions = {
  fileId: string;
  range?: string | undefined;
  res: Response;
  apiKey: string;
  baseUrl?: string;
};

// Pipes the file through this server, so a slow viewer applies backpressure
// and a closed tab cancels the download from Google.
export async function streamVeoVideo({
  fileId,
  range,
  res,
  apiKey,
  baseUrl = process.env.GEMINI_FILES_BASE_URL || DEFAULT_BASE_URL,
}: StreamOptions): Promise<void> {
  const abort = new AbortController();
  const onClose = () => abort.abort();
  res.once("close", onClose);

  try {
    const upstream = await fetch(
      `${baseUrl}/files/${fileId}:download?alt=media`,
      {
        headers: {
          "x-goog-api-key": apiKey,
          ...(range ? { range } : {}),
        },
        signal: abort.signal,
      },
    );

    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      const expired = upstream.status === 403 || upstream.status === 404;
      res.status(expired ? 404 : 502).json({
        message: expired ? "Video is no longer available" : "Video download failed",
      });
      return;
    }

    res.status(upstream.status);
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    // Helmet defaults to same origin, which would stop the site's video tag.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "private, max-age=3600");

    await pipeline(
      Readable.fromWeb(upstream.body as unknown as WebReadableStream),
      res,
    );
  } catch (err) {
    if (abort.signal.aborted) return;
    console.error("Video stream failed:", (err as Error).name);
    if (!res.headersSent) {
      res.status(502).json({ message: "Video download failed" });
    } else {
      res.destroy();
    }
  } finally {
    res.off("close", onClose);
  }
}
