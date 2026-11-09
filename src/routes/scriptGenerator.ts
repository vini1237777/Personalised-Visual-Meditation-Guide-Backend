import express from "express";
import scriptGeneratorController from "../controllers/scriptGeneratorController";
import { authMiddleware } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validateRequest";
import { generateSchema } from "../validators/authValidator";

const router = express.Router();

router.post(
  "/post",
  authMiddleware,
  validateRequest(generateSchema),
  scriptGeneratorController.getScript,
);
router.get("/jobs/:jobId", authMiddleware, scriptGeneratorController.getJob);
router.get(
  "/video-link",
  authMiddleware,
  scriptGeneratorController.getVideoLink,
);
router.get("/video/:fileId", scriptGeneratorController.streamVideo);

export const scriptRoutes = router;
