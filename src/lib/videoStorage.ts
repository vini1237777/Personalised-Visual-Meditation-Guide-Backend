import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const LINK_EXPIRES_SECONDS = 60 * 60;
const PART_SIZE_BYTES = 8 * 1024 * 1024;

let client: S3Client | null = null;

function getS3() {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      // Only set in tests, to point the SDK at a local server.
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
    });
  }
  return client;
}

function bucket() {
  const name = process.env.S3_VIDEO_BUCKET;
  if (!name) throw new Error("S3_VIDEO_BUCKET is not set");
  return name;
}

export function isS3Enabled() {
  return Boolean(process.env.S3_VIDEO_BUCKET);
}

// Streams from Google to S3 in parts, so at most two parts sit in memory
// however long the video is.
export async function copyVeoVideoToS3({
  fileId,
  userId,
  apiKey,
}: {
  fileId: string;
  userId: string;
  apiKey: string;
}): Promise<string> {
  const base = process.env.GEMINI_FILES_BASE_URL || DEFAULT_GEMINI_BASE;
  const source = await fetch(`${base}/files/${fileId}:download?alt=media`, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!source.ok || !source.body) {
    await source.body?.cancel();
    throw new Error(`Veo download failed with status ${source.status}`);
  }

  const key = `videos/${userId}/${randomUUID()}.mp4`;
  await new Upload({
    client: getS3(),
    queueSize: 2,
    partSize: PART_SIZE_BYTES,
    params: {
      Bucket: bucket(),
      Key: key,
      Body: Readable.fromWeb(source.body as unknown as WebReadableStream),
      ContentType: "video/mp4",
    },
  }).done();
  return key;
}

export function presignVideo(key: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: LINK_EXPIRES_SECONDS },
  );
}
