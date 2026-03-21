import { Request, Response, NextFunction } from "express";
import { createAuthenticatedClient } from "../insforge-client";

// Extend Express Request to carry auth context
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      userId?: string;
      insforgeClient?: any;
    }
  }
}

/**
 * Auth middleware for InsForge mode.
 * - Extracts Bearer token from Authorization header
 * - Creates a per-request InsForge client with the user's JWT
 * - Validates the token by calling getCurrentUser()
 * - Attaches user + userId + client to req
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.query.token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: "Missing or invalid authentication" });
    return;
  }

  try {
    const client = createAuthenticatedClient(token);
    const { data, error } = await client.auth.getCurrentUser();

    if (error || !data?.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    req.user = { id: data.user.id, email: data.user.email };
    req.userId = data.user.id;
    req.insforgeClient = client;
    next();
  } catch {
    res.status(401).json({ error: "Authentication failed" });
  }
}
