import { Router, Request, Response } from "express";

const router = Router();

function getAnonClient() {
  return require("../insforge-client").default;
}

// POST /api/auth/signup
router.post("/signup", async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const client = getAnonClient();
  const { data, error } = await client.auth.signUp({ email, password, name: name || "" });
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({
    user: data?.user || null,
    accessToken: data?.accessToken || null,
    refreshToken: data?.refreshToken || null,
  });
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const client = getAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({
    user: data?.user || null,
    accessToken: data?.accessToken || null,
    refreshToken: data?.refreshToken || null,
  });
});

// POST /api/auth/resend-verification — resend OTP code
router.post("/resend-verification", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const client = getAnonClient();
  const { data, error } = await client.auth.resendVerificationEmail({ email });
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ success: true, message: data?.message || "Verification email sent" });
});

// POST /api/auth/logout
router.post("/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { createAuthenticatedClient } = require("../insforge-client");
      const client = createAuthenticatedClient(authHeader.slice(7));
      await client.auth.signOut();
    } catch {}
  }
  res.json({ ok: true });
});

// GET /api/auth/me — validate token and return user info
router.get("/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    const { createAuthenticatedClient } = require("../insforge-client");
    const client = createAuthenticatedClient(authHeader.slice(7));
    const { data, error } = await client.auth.getCurrentUser();
    if (error || !data?.user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    res.json({ user: data.user });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// POST /api/auth/verify — verify email with OTP code
router.post("/verify", async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400).json({ error: "email and otp are required" });
    return;
  }

  const client = getAnonClient();
  const { data, error } = await client.auth.verifyEmail({ email, otp });
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({
    user: data?.user || null,
    accessToken: data?.accessToken || null,
    refreshToken: data?.refreshToken || null,
  });
});

// POST /api/auth/refresh — refresh access token
router.post("/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken is required" });
    return;
  }

  const client = getAnonClient();
  const { data, error } = await client.auth.refreshSession({ refreshToken });
  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({
    accessToken: data?.accessToken || null,
    refreshToken: data?.refreshToken || null,
    user: data?.user || null,
  });
});

export default router;
