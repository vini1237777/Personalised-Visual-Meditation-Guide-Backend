import express from "express";
import scriptService from "../services/scriptService";
import { GoogleGenAI } from "@google/genai";
import { ChatOpenAI } from "@langchain/openai";
import { promptVal } from "../lib/functions";
import "dotenv/config";

// @ts-ignore: Unreachable code error
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const llmModel = new ChatOpenAI({
  model: "gpt-4o",
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
    throw new Error(error?.message || "Failed to create script");
  }
}

async function getScriptVideo(script: string) {
  const prompt = `You are an animation expert.
  Use the following script to create a visual meditation guide animation:
  "${script}". The video must:
  - Match the mood and feeling expressed in the script.`;
  let operation = await ai.models.generateVideos({
    model: "veo-3.0-generate-preview",
    prompt,
  });
  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }
  const videoUri = operation?.response?.generatedVideos?.[0]?.video?.uri;

  if (videoUri && videoUri?.length > 0) {
    const url = decodeURIComponent(videoUri);
    const videoUriResponse = await fetch(`${url}&key=${apiKey}`);
    const videoUrlRes = videoUriResponse?.url;
    return videoUrlRes;
  } else {
    return "";
  }
}

export default class scriptGeneratorController {
  static async getScript(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { selectedFeelings, selectedEmojis, email } = req.body || {};
      if (!email) return res.status(400).json({ message: "Email is required" });

      const generatedScripts = await fetchScript({
        selectedFeelings,
        selectedEmojis,
      });

      if (!generatedScripts) {
        return res.status(502).json({ message: "Script generation failed" });
      }

      const videoUrl = await getScriptVideo(generatedScripts);

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
}
