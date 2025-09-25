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

// export const createScript = async ({
//   selectedFeelings,
//   selectedEmojis,
// }: {
//   selectedFeelings: string[];
//   selectedEmojis: any;
// }) => {
//   return await llmModel.invoke([
//     new SystemMessage(
//       "You are a helpful assistant that always replies in English."
//     ),
//     new HumanMessage(promptVal({ selectedFeelings, selectedEmojis })),
//   ]);
// };

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
  // Normalize to string
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

// async function fetchScript({
//   selectedFeelings,
//   selectedEmojis,
// }: {
//   selectedFeelings: string[];
//   selectedEmojis: any;
// }) {
//   try {
//     const response = await createScript({
//       selectedFeelings,
//       selectedEmojis,
//     });
//     const data = response?.content;
//     return data;
//   } catch (error: any) {
//     throw new Error(error);
//   }
// }

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

// async function getScriptVideo(script: string) {
//   const prompt = `You are an animation expert.
// Use the following script to create a visual meditation guide animation:
// "${script}". The video must:
// - Match the mood and feeling expressed in the script.`;

//   let operation = await ai.models.generateVideos({
//     model: "veo-3.0-generate-preview",
//     prompt,
//   });

//   while (!operation.done) {
//     await new Promise((resolve) => setTimeout(resolve, 10000));
//     console.log(" I am running");
//     operation = await ai.operations.getVideosOperation({
//       operation: operation,
//     });
//   }

//   // Step 3: Get video URL
//   const videoUrl: any = operation?.response?.generatedVideos?.[0]?.video?.uri;

//   if (videoUrl) {
//     const url = decodeURIComponent(videoUrl);
//     const videoUriResponse = await fetch(`${url}&key=${apiKey}`);
//     const videoUrlRes = videoUriResponse?.url;
//     return videoUrlRes;
//   }
// }

async function getScriptVideo(script: string) {
  const prompt = `You are an animation expert.
  Use the following script to create a visual meditation guide animation:
  "${script}". The video must:
  - Match the mood and feeling expressed in the script.`;
  let operation = await ai.models.generateVideos({
    model: "veo-3.0-fastest-generate-preview",
    prompt,
  });
  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }
  const videoUri = operation?.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) return undefined;
  const url = decodeURIComponent(videoUri);
  const videoUriResponse = await fetch(`${url}&key=${apiKey}`);
  if (videoUri?.length > 0) return videoUriResponse?.url; // final playable URL
  // return "https://generativelanguage.googleapis.com/download/v1beta/files/9ojkq72px8eb:download?alt=media&key=AIzaSyBrsnbKgJLhEBRFKq0sC0ezVuap4SCuIqc";
}

// export default class scriptGeneratorController {
//   static async getScript(
//     req: express.Request,
//     res: express.Response,
//     next: express.NextFunction
//   ) {
//     try {
//       // console.log(req.body, "reqbody");
//       const selectedFeelings = req.body?.selectedFeelings;
//       const selectedEmojis = req.body?.selectedEmojis;
//       const email = req.body?.userState?.email;

//       const userInfo = await UserService.getByEmail(email);

//       const generatedScripts: any = await fetchScript({
//         selectedFeelings,
//         selectedEmojis,
//       });

//       console.log(generatedScripts, "generatedScripts");

//       if (generatedScripts) {
//         const videoUrl = await getScriptVideo(generatedScripts);
//         await scriptService.getScript({
//           selectedFeelings,
//           selectedEmojis,
//           userInfo,
//           generatedScripts,
//           videoUrl,
//         });

//         console.log(videoUrl, "videoUrl");

//         return res.status(200).json({
//           generatedScripts: generatedScripts,
//           ...userInfo,
//           videoUrl,
//         });
//       }
//     } catch (err) {
//       next(err);
//     }
//   }
// }

export default class scriptGeneratorController {
  static async getScript(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { selectedFeelings, selectedEmojis, userState } = req.body || {};
      const email = userState?.email;
      if (!email)
        return res
          .status(400)
          .json({ message: "Email is required in userState" });

      const userInfo = await UserService.getByEmail(email);
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
        userInfo,
        generatedScripts,
        videoUrl,
      });

      return res.status(200).json({
        // (Option A) keep flat fields, but then frontend must read them as top-level keys
        ...userInfo,
        generatedScripts,
        videoUrl,
      });

      // (Option B) cleaner shape:
      // return res.status(200).json({ user: userInfo, generatedScripts, videoUrl });
    } catch (err) {
      next(err);
    }
  }
}
