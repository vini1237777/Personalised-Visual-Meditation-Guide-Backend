import { GoogleGenAI } from "@google/genai";

export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_MODEL = "gemini-embedding-001";

let ai: GoogleGenAI | null = null;

function getAi() {
  if (!ai) {
    const baseUrl = process.env.GEMINI_API_BASE_URL;
    ai = new GoogleGenAI({
      vertexai: false,
      apiKey: process.env.GEMINI_API_KEY as string,
      ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
    });
  }
  return ai;
}

export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[]> {
  const response = await getAi().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  const values = response.embeddings?.[0]?.values;
  // Atlas compares by position, so a wrong length must never reach the index.
  if (values?.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions`);
  }
  return values;
}
