import mongoose from "mongoose";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

const generationJobSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    selectedFeelings: { type: [String], default: [] },
    selectedEmojis: { type: [String], default: [] },
    apiUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "running", "done", "failed"],
      default: "queued",
    },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date },
    generatedScripts: { type: String },
    videoKey: { type: String },
    videoUrl: { type: String },
    createdAt: { type: Date, default: Date.now, expires: SEVEN_DAYS_SECONDS },
  },
  { versionKey: false },
);

generationJobSchema.index({ userId: 1, status: 1 });

export default mongoose.model("GenerationJob", generationJobSchema);
