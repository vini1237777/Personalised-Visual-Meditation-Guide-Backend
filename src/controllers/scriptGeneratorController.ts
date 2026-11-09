import express from "express";
import mongoose from "mongoose";
import { UserDao } from "../dao/userDao";
import { canGenerate } from "../lib/generationAccess";
import { isValidFileId, streamVeoVideo } from "../lib/geminiVideo";
import { enqueueJob, isQueueEnabled } from "../lib/jobQueue";
import {
  isS3Enabled,
  LINK_EXPIRES_SECONDS,
  presignVideo,
} from "../lib/videoStorage";
import GenerationJob from "../models/generationJobModel";
import { findActiveJob, runJob } from "../services/jobRunner";
import { generateMeditation } from "../services/meditationGenerator";
import { sessionMemory } from "../services/sessionMemory";

function publicApiUrl(req: express.Request) {
  return process.env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`;
}

// Without a queue the job runs in this process, so local development needs no AWS.
async function startJob(jobId: string) {
  if (isQueueEnabled()) return enqueueJob(jobId);
  runJob(jobId, generateMeditation).catch((err) =>
    console.error(`Job ${jobId} crashed:`, err.message),
  );
}

export default class scriptGeneratorController {
  // Links expire, so a signed in user can ask for a new one to their own video.
  static async getVideoLink(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      const user = await UserDao.getById(String(req.user?.sub));
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!user.videoKey || !isS3Enabled()) {
        return res.status(404).json({ message: "No saved video" });
      }
      return res.status(200).json({
        videoUrl: await presignVideo(user.videoKey),
        expiresInSeconds: LINK_EXPIRES_SECONDS,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getScript(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      const { selectedFeelings, selectedEmojis } = req.body;

      // Whoever holds the token owns this job, whatever email is sent.
      const user = await UserDao.getById(String(req.user?.sub));
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!canGenerate(user.email)) {
        return res
          .status(403)
          .json({ message: "Live generation is not available on this account" });
      }
      const userId = String(user._id);

      // Each job pays for a video, so a repeat click joins the one in progress.
      const active = await findActiveJob(userId);
      if (active) return res.status(202).json({ jobId: String(active._id) });

      const job = await GenerationJob.create({
        userId,
        selectedFeelings,
        selectedEmojis,
        apiUrl: publicApiUrl(req),
      });
      const jobId = String(job._id);

      try {
        await startJob(jobId);
      } catch (err) {
        console.error(`Queueing job ${jobId} failed:`, (err as Error).message);
        await GenerationJob.updateOne({ _id: jobId }, { status: "failed" });
        return res
          .status(503)
          .json({ message: "Could not start generation. Please try again." });
      }

      return res.status(202).json({ jobId });
    } catch (err) {
      next(err);
    }
  }

  static async getJob(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      const jobId = String(req.params.jobId ?? "");
      // Someone else's job looks the same as one that does not exist.
      const job = mongoose.isValidObjectId(jobId)
        ? await GenerationJob.findOne({
            _id: jobId,
            userId: String(req.user?.sub),
          })
        : null;
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.status !== "done") return res.json({ status: job.status });

      return res.json({
        status: job.status,
        generatedScripts: job.generatedScripts,
        reused: Boolean(job.reused),
        videoUrl: job.videoKey
          ? await presignVideo(job.videoKey)
          : (job.videoUrl ?? ""),
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSimilarSessions(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      const closest = await sessionMemory.findClosest(
        String(req.user?.sub),
        req.body,
      );
      const sessions = await Promise.all(
        closest.map(async ({ videoKey, ...session }) => ({
          ...session,
          videoUrl: await presignVideo(videoKey),
        })),
      );
      return res.json({ sessions });
    } catch (err) {
      next(err);
    }
  }

  static async streamVideo(req: express.Request, res: express.Response) {
    const fileId = String(req.params.fileId ?? "");
    if (!isValidFileId(fileId)) {
      return res.status(400).json({ message: "Invalid video id" });
    }
    await streamVeoVideo({
      fileId,
      range: req.headers.range,
      res,
      apiKey: process.env.GEMINI_API_KEY as string,
    });
  }
}
