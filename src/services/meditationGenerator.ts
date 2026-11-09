import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChatOpenAI } from "@langchain/openai";
// @ts-ignore: Unreachable code error
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { promptVal } from "../lib/functions";
import { fileIdFromVeoUri, videoPath } from "../lib/geminiVideo";
import { copyVeoVideoToS3, isS3Enabled } from "../lib/videoStorage";

const llmModel = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.7,
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const ai = new GoogleGenAI({ vertexai: false, apiKey });

const VEO_POLL_MS = 10_000;
const VEO_TIME_LIMIT_MS = 6 * 60 * 1000;

export type GenerationInput = {
  userId: string;
  selectedFeelings: string[];
  selectedEmojis: string[];
  apiUrl: string;
};

export type GenerationResult = {
  generatedScripts: string;
  videoUrl?: string;
  videoKey?: string;
};

export type Generate = (input: GenerationInput) => Promise<GenerationResult>;

async function createScript({
  selectedFeelings,
  selectedEmojis,
}: Pick<GenerationInput, "selectedFeelings" | "selectedEmojis">) {
  const msg = await llmModel.invoke([
    new SystemMessage(
      "You are a helpful assistant that always replies in English.",
    ),
    new HumanMessage(promptVal({ selectedFeelings, selectedEmojis })),
  ]);
  const content =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .map((c: any) => (typeof c === "string" ? c : (c?.text ?? "")))
            .join("\n")
        : String(msg.content ?? "");
  return content.trim();
}

async function createVideoFileId(script: string) {
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

// A failed copy should not cost the viewer their video, so it falls back to the
// streaming route. Google expires that file, so the video just won't last as long.
async function storeVideo(
  fileId: string,
  userId: string,
  apiUrl: string,
): Promise<Pick<GenerationResult, "videoUrl" | "videoKey">> {
  const videoUrl = `${apiUrl}${videoPath(fileId)}`;
  if (!isS3Enabled()) return { videoUrl };
  try {
    return {
      videoKey: await copyVeoVideoToS3({
        fileId,
        userId,
        apiKey: apiKey as string,
      }),
    };
  } catch (err) {
    console.error("S3 copy failed:", (err as Error).message);
    return { videoUrl };
  }
}

export const generateMeditation: Generate = async ({
  userId,
  selectedFeelings,
  selectedEmojis,
  apiUrl,
}) => {
  const generatedScripts = await createScript({
    selectedFeelings,
    selectedEmojis,
  });
  if (!generatedScripts) throw new Error("The script came back empty");

  const fileId = await createVideoFileId(generatedScripts);
  return {
    generatedScripts,
    ...(fileId ? await storeVideo(fileId, userId, apiUrl) : {}),
  };
};
