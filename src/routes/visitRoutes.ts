import { createHmac } from "node:crypto";
import express from "express";
import { isbot } from "isbot";
import Visitor from "../models/visitorModel";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const secret = process.env.VISIT_HASH_SECRET || process.env.JWT_ACCESS_SECRET;
    if (!secret) return res.status(503).json({ message: "Unavailable" });

    const userAgent = req.get("user-agent");
    if (userAgent && !isbot(userAgent) && req.ip) {
      const _id = createHmac("sha256", secret).update(req.ip).digest("hex");
      await Visitor.updateOne(
        { _id },
        { $setOnInsert: { firstSeenAt: new Date() } },
        { upsert: true },
      );
    }

    return res.json({ visitors: await Visitor.estimatedDocumentCount() });
  } catch (err) {
    next(err);
  }
});

export const visitRoutes = router;
