import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  sub: string;
  role: "guest" | "hotel" | "admin";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      /** Supabase access token for user-scoped Supabase calls (RLS). Set from x-supabase-access-token. */
      supabaseAccessToken?: string;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    const supabaseToken = req.headers["x-supabase-access-token"];
    if (typeof supabaseToken === "string") req.supabaseAccessToken = supabaseToken;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: AuthPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

