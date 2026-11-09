import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import mongoose from "mongoose";
import { runJob } from "../services/jobRunner";
import type { Generate } from "../services/meditationGenerator";

// Kept across invocations, so a warm Lambda reuses its database connection.
async function connectOnce() {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

function readJobId(body: string): string | null {
  try {
    const { jobId } = JSON.parse(body);
    return mongoose.isValidObjectId(jobId) ? String(jobId) : null;
  } catch {
    return null;
  }
}

export function createHandler(generate: Generate, run = runJob) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

    for (const record of event.Records) {
      const jobId = readJobId(record.body);
      if (!jobId) {
        // Retrying cannot repair it, so it is dropped rather than retried.
        console.error(`Dropped unreadable message ${record.messageId}`);
        continue;
      }
      try {
        await connectOnce();
        await run(jobId, generate);
      } catch (err) {
        // Reaching here means the database failed, not the generation. Report
        // only this message, so SQS retries it and then moves it to the DLQ.
        console.error(`Job ${jobId} will retry:`, (err as Error).message);
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}
