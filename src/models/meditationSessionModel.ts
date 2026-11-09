import mongoose from "mongoose";

// A finished session whose video is safely in S3. The vector index that searches
// `embedding` lives in Atlas: see atlas/meditation-session-vector-index.json.
const meditationSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    selectedFeelings: { type: [String], default: [] },
    selectedEmojis: { type: [String], default: [] },
    generatedScripts: { type: String, required: true },
    videoKey: { type: String, required: true },
    embedding: { type: [Number], required: true, select: false },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("MeditationSession", meditationSessionSchema);
