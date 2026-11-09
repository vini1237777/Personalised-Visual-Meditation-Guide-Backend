import GenerationJob from "../models/generationJobModel";
import { UserDao } from "../dao/userDao";
import type { Generate } from "./meditationGenerator";
import { sessionMemory, type SessionMemory } from "./sessionMemory";

// One minute past the 15 minute Lambda limit. A worker cannot outlive its limit,
// so a job still "running" after this belongs to a worker that crashed.
export const STALE_AFTER_MS = 16 * 60 * 1000;

const staleBefore = () => new Date(Date.now() - STALE_AFTER_MS);

// SQS delivers at least once, so the same job can arrive twice. This update is
// atomic, which means only one delivery gets the job and pays for a video.
function claimJob(jobId: string) {
  return GenerationJob.findOneAndUpdate(
    {
      _id: jobId,
      $or: [
        { status: "queued" },
        { status: "running", startedAt: { $lt: staleBefore() } },
      ],
    },
    { $set: { status: "running", startedAt: new Date() }, $inc: { attempts: 1 } },
    { new: true },
  );
}

export function findActiveJob(userId: string) {
  return GenerationJob.findOne({
    userId,
    $or: [
      { status: "queued" },
      { status: "running", startedAt: { $gte: staleBefore() } },
    ],
  });
}

export async function runJob(
  jobId: string,
  generate: Generate,
  memory: SessionMemory = sessionMemory,
): Promise<"finished" | "reused" | "failed" | "skipped"> {
  const job = await claimJob(jobId);
  if (!job) return "skipped";
  const mood = {
    selectedFeelings: job.selectedFeelings,
    selectedEmojis: job.selectedEmojis,
  };

  let result;
  try {
    result = await generate({
      userId: job.userId,
      ...mood,
      apiUrl: job.apiUrl,
    });
  } catch (err) {
    // Not rethrown: a retry would pay for another video, and most failures here
    // (a refused prompt, a Veo timeout) would fail again.
    console.error(`Job ${jobId} failed:`, (err as Error).message);

    // Instead of an error, offer the closest session this user already has.
    const [closest] = await memory
      .findClosest(job.userId, mood, 1)
      .catch((searchErr) => {
        console.error(`Search for job ${jobId} failed:`, searchErr.message);
        return [];
      });
    if (closest) {
      await GenerationJob.updateOne(
        { _id: jobId },
        {
          status: "done",
          reused: true,
          generatedScripts: closest.generatedScripts,
          videoKey: closest.videoKey,
        },
      );
      return "reused";
    }

    await GenerationJob.updateOne({ _id: jobId }, { status: "failed" });
    return "failed";
  }

  await GenerationJob.updateOne({ _id: jobId }, { status: "done", ...result });

  // The video is paid for and the job is done, so a failure here is only logged.
  await UserDao.updateById(job.userId, {
    ...mood,
    generatedScripts: result.generatedScripts,
    ...(result.videoKey ? { videoKey: result.videoKey } : {}),
  }).catch((err) =>
    console.error(`Saving job ${jobId} to its user failed:`, err.message),
  );

  // Only S3 videos last, so only those are worth finding again later.
  if (result.videoKey) {
    await memory
      .save({
        ...mood,
        userId: job.userId,
        generatedScripts: result.generatedScripts,
        videoKey: result.videoKey,
      })
      .catch((err) =>
        console.error(`Remembering job ${jobId} failed:`, err.message),
      );
  }
  return "finished";
}
