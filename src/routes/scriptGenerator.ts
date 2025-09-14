import express from "express";
// import { authMiddleware } from "../middleware/authMiddleware";
import scriptGeneratorController from "../controllers/scriptGeneratorController";
// import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/post", scriptGeneratorController.getScript);

export const scriptRoutes = router;
