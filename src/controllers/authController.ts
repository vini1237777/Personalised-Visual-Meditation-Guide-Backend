import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
// Removed unused bcrypt import
import AuthService from "../services/authService";
import userModel from "../models/userModel";

const ACCESS_EXPIRES_IN = "1h";

export default class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { fullName, email, password } = req.body;
      if (!fullName || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const userData = await AuthService.register({
        fullName,
        email,
        password,
      });

      if (!userData) {
        return res.status(500).json({ error: "User registration failed" });
      }

      const secret = process.env.JWT_ACCESS_SECRET!;
      const token = jwt.sign(
        { sub: userData.user.id, roles: userData.user.roles },
        secret,
        { expiresIn: ACCESS_EXPIRES_IN }
      );

      return res.status(201).json({
        user: { ...userData.user },
        token,
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const userDoc = await userModel
        .findOne({ email: normalizedEmail })
        .select("+password")
        .lean();

      if (!userDoc || !userDoc.password) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const bcrypt = await import("bcrypt");
      const isMatch = await bcrypt.compare(
        String(password),
        String(userDoc.password)
      );

      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const secret = process.env.JWT_ACCESS_SECRET!;
      const token = jwt.sign(
        { sub: userDoc._id, roles: userDoc.roles },
        secret,
        { expiresIn: ACCESS_EXPIRES_IN || "1h" }
      );

      return res.status(200).json({ token, ...userDoc });
    } catch (err) {
      next(err);
    }
  }
}
