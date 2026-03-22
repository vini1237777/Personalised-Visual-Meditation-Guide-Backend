import express from "express";
import authController from "../controllers/authController";
import { validateRequest } from "../middleware/validateRequest";
import { loginSchema, signupSchema } from "../validators/authValidator";

const router = express.Router();

router.post(
  "/register",
  validateRequest(signupSchema),
  authController.register,
);
router.post("/login", validateRequest(loginSchema), authController.login);

export const authRoutes = router;
