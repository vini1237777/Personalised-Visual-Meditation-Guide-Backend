import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

let client: SQSClient | null = null;

export function isQueueEnabled() {
  return Boolean(process.env.SQS_QUEUE_URL);
}

export async function enqueueJob(jobId: string) {
  client ??= new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
  await client.send(
    new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ jobId }),
    }),
  );
}
