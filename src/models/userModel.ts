import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    selectedFeelings: { type: [String], default: [] },
    selectedEmojis: { type: [String], default: [] },
    generateScript: { type: String },
    roles: { type: [String], default: ["user"] },
  },

  { timestamps: true }
);

export default mongoose.model("User", userSchema);
