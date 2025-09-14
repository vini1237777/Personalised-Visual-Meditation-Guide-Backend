// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import AuthService from "../services/authService";

const ACCESS_EXPIRES_IN = "1h";

export default class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { fullName, email, password, id, roles } = req.body;
      if (!fullName || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const user = await AuthService.register({
        fullName,
        email,
        password,
        id,
      });
      const secret = process.env.JWT_ACCESS_SECRET!;
      const token = jwt.sign({ sub: id, roles: roles }, secret, {
        expiresIn: ACCESS_EXPIRES_IN,
      });

      return res.status(201).json({
        user: { id: id, email: email, roles: roles },
        token,
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, roles, id } = req.body;
      const user = await AuthService.login({ email, password }); // throws on invalid
      const secret = process.env.JWT_ACCESS_SECRET!;
      const token = jwt.sign({ sub: id, roles }, secret, {
        expiresIn: ACCESS_EXPIRES_IN,
      });

      return res.status(200).json({
        user: { id, email, roles },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
}
