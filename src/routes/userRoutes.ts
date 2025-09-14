import express from "express";
import userController from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/get", authMiddleware, userController.get);
router.put("/update/:id", authMiddleware, userController.update);

export const userRoutes = router;
