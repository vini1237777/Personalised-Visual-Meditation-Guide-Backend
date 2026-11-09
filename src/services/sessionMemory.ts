import { embedText } from "../lib/embeddings";
import MeditationSession from "../models/meditationSessionModel";

export const VECTOR_INDEX_NAME = "meditation_session_vector";
const CANDIDATES_PER_RESULT = 20;

type Mood = { selectedFeelings: string[]; selectedEmojis: string[] };

export type ClosestSession = {
  generatedScripts: string;
  videoKey: string;
  selectedFeelings: string[];
  selectedEmojis: string[];
  score: number;
};

export type SessionMemory = {
  save: (
    session: Mood & {
      userId: string;
      generatedScripts: string;
      videoKey: string;
    },
  ) => Promise<void>;
  findClosest: (
    userId: string,
    mood: Mood,
    limit?: number,
  ) => Promise<ClosestSession[]>;
};

// Off by default, because $vectorSearch only exists on Atlas.
export function isVectorSearchEnabled() {
  return process.env.VECTOR_SEARCH === "on";
}

// Saved sessions and new requests are both a mood, so they embed the same way.
export function moodText({ selectedFeelings, selectedEmojis }: Mood) {
  return `Feeling: ${selectedFeelings.join(", ")}. Emojis: ${selectedEmojis.join(" ")}`;
}

// The userId filter runs inside the search, so the limit counts only this user's
// sessions and nobody is ever served someone else's meditation.
export function closestSessionsPipeline(
  userId: string,
  queryVector: number[],
  limit: number,
) {
  return [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: limit * CANDIDATES_PER_RESULT,
        limit,
        filter: { userId: { $eq: userId } },
      },
    },
    {
      $project: {
        _id: 0,
        generatedScripts: 1,
        videoKey: 1,
        selectedFeelings: 1,
        selectedEmojis: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];
}

export const sessionMemory: SessionMemory = {
  async save(session) {
    if (!isVectorSearchEnabled()) return;
    await MeditationSession.create({
      ...session,
      embedding: await embedText(moodText(session), "RETRIEVAL_DOCUMENT"),
    });
  },

  async findClosest(userId, mood, limit = 3) {
    if (!isVectorSearchEnabled()) return [];
    const queryVector = await embedText(moodText(mood), "RETRIEVAL_QUERY");
    return MeditationSession.aggregate(
      closestSessionsPipeline(userId, queryVector, limit) as any[],
    );
  },
};
