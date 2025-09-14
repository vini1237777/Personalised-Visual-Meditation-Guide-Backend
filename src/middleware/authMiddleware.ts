// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface JwtUser {
  sub: string; // user id
  roles?: string[]; // optional roles
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const secret = process.env.JWT_ACCESS_SECRET!;
    const decoded = jwt.verify(token, secret) as JwtUser;
    req.user = decoded; // attach user for downstream handlers
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export const requireRole =
  (...allowed: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const roles = req.user?.roles || [];
    const ok = roles.some((r) => allowed.includes(r));
    if (!ok) return res.status(403).json({ error: "Forbidden" });
    next();
  };
