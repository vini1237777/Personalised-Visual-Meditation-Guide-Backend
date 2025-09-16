import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, unique: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  selectedFeelings: { type: [] },
  selectedEmojis: { type: [] },
  generateScript: { type: String },
  roles: { type: [String], default: ["user"] },
});

export default mongoose.model("User", userSchema);
