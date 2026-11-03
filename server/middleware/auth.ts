import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  const secret = process.env.JWT_SECRET;
  if (!token) return res.status(401).json({ error: "Authentication required." });
  if (!secret || secret.length < 32) return res.status(503).json({ error: "Authentication is not configured. Set JWT_SECRET to at least 32 characters." });
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      return res.status(401).json({ error: "Invalid session." });
    }
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}
