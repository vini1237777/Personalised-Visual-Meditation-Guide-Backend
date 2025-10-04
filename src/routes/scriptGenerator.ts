import express from "express";
import scriptGeneratorController from "../controllers/scriptGeneratorController";

const router = express.Router();

router.post("/post", scriptGeneratorController.getScript);

export const scriptRoutes = router;
