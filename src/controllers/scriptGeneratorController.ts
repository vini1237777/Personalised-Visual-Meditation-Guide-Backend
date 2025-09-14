import express from "express";
import scriptService from "../services/scriptService";
import { GoogleGenAI } from "@google/genai";
import { ChatOpenAI } from "@langchain/openai";
import { promptVal } from "../lib/functions";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import UserService from "../services/UserService";

const llmModel = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.7,
  // openAIApiKey: process.env.OPENAI_API_KEY,
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
  return await llmModel.invoke([
    new SystemMessage(
      "You are a helpful assistant that always replies in English."
    ),
    new HumanMessage(promptVal({ selectedFeelings, selectedEmojis })),
  ]);
};

async function fetchScript({
  selectedFeelings,
  selectedEmojis,
}: {
  selectedFeelings: string[];
  selectedEmojis: any;
}) {
  try {
    const response = await createScript({
      selectedFeelings,
      selectedEmojis,
    });
    const data = response?.content;
    return data;
  } catch (error: any) {
    throw new Error(error);
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
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log(" I am running");
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }

  // Step 3: Get video URL
  const videoUrl: any = operation?.response?.generatedVideos?.[0]?.video?.uri;

  if (videoUrl) {
    const url = decodeURIComponent(videoUrl);
    const videoUriResponse = await fetch(`${url}&key=${apiKey}`);
    const videoUrlRes = videoUriResponse?.url;
    return videoUrlRes;
  }
}

export default class scriptGeneratorController {
  static async getScript(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      // console.log(req.body, "reqbody");
      const selectedFeelings = req.body?.selectedFeelings;
      const selectedEmojis = req.body?.selectedEmojis;
      const email = req.body?.userState?.email;

      const userInfo = await UserService.getByEmail(email);

      const generatedScripts: any = await fetchScript({
        selectedFeelings,
        selectedEmojis,
      });

      console.log(generatedScripts, "generatedScripts");

      if (generatedScripts) {
        const videoUrl = await getScriptVideo(generatedScripts);
        await scriptService.getScript({
          selectedFeelings,
          selectedEmojis,
          userInfo,
          generatedScripts,
          videoUrl,
        });

        console.log(videoUrl, "videoUrl");

        return res.status(200).json({
          generatedScripts: generatedScripts,
          ...userInfo,
          videoUrl,
        });
      }
    } catch (err) {
      next(err);
    }
  }
}
