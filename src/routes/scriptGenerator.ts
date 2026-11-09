import express from "express";
import scriptGeneratorController from "../controllers/scriptGeneratorController";

const router = express.Router();

router.post("/post", scriptGeneratorController.getScript);
router.get("/video/:fileId", scriptGeneratorController.streamVideo);

export const scriptRoutes = router;
