import mongoose from "mongoose";

const visitorSchema = new mongoose.Schema(
  {
    // A keyed hash of the network address, so the address itself is never stored.
    _id: { type: String, required: true },
    firstSeenAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export default mongoose.model("Visitor", visitorSchema);
