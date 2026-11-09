import express from "express";
import scriptService from "../services/scriptService";
import { UserDao } from "../dao/userDao";
import { GoogleGenAI } from "@google/genai";
import { ChatOpenAI } from "@langchain/openai";
import { promptVal } from "../lib/functions";
import {
  fileIdFromVeoUri,
  isValidFileId,
  streamVeoVideo,
  videoPath,
} from "../lib/geminiVideo";
import "dotenv/config";

// @ts-ignore: Unreachable code error
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const llmModel = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.7,
  // apiKey: process.env.OPENAI_API_KEY,
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const ai = new GoogleGenAI({
  vertexai: false,
  apiKey: `${process.env.GEMINI_API_KEY}`,
});

export const createScript = async ({
  selectedFeelings,
  selectedEmojis,
}: {
  selectedFeelings: string[];
  selectedEmojis: any;
}) => {
  const msg = await llmModel.invoke([
    new SystemMessage(
      "You are a helpful assistant that always replies in English."
    ),
    new HumanMessage(promptVal({ selectedFeelings, selectedEmojis })),
  ]);
  const content =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
      ? msg.content
          .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
          .join("\n")
      : String(msg.content ?? "");
  return content.trim();
};

async function fetchScript({
  selectedFeelings,
  selectedEmojis,
}: {
  selectedFeelings: string[];
  selectedEmojis: any;
}) {
  try {
    return await createScript({ selectedFeelings, selectedEmojis });
  } catch (error: any) {
    throw new Error("Failed to create script");
  }
}

const VEO_POLL_MS = 10_000;
const VEO_TIME_LIMIT_MS = 6 * 60 * 1000;

function publicApiUrl(req: express.Request) {
  return process.env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`;
}

async function getScriptVideoFileId(script: string) {
  const prompt = `You are an animation expert.
  Use the following script to create a visual meditation guide animation:
  "${script}". The video must:
  - Match the mood and feeling expressed in the script.`;
  let operation = await ai.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt,
  });
  const deadline = Date.now() + VEO_TIME_LIMIT_MS;
  while (!operation.done) {
    if (Date.now() > deadline) throw new Error("Video generation timed out");
    await new Promise((r) => setTimeout(r, VEO_POLL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
  }
  const videoUri = operation?.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) return null;

  const fileId = fileIdFromVeoUri(videoUri);
  if (!fileId) throw new Error("Unexpected video link from Veo");
  return fileId;
}

export default class scriptGeneratorController {
  static async getScript(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { selectedFeelings, selectedEmojis } = req.body;

      // Whoever holds the token owns this session, whatever email is sent.
      const user = await UserDao.getById(String(req.user?.sub));
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { email } = user;

      const generatedScripts = await fetchScript({
        selectedFeelings,
        selectedEmojis,
      });

      if (!generatedScripts) {
        return res.status(502).json({ message: "Script generation failed" });
      }

      const fileId = await getScriptVideoFileId(generatedScripts);
      const videoUrl = fileId ? `${publicApiUrl(req)}${videoPath(fileId)}` : "";

      await scriptService.getScript({
        selectedFeelings,
        selectedEmojis,
        email,
        generatedScripts,
        videoUrl,
      });

      return res.status(200).json({
        generatedScripts,
        videoUrl,
      });
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
      apiKey: apiKey as string,
    });
  }
}
