import { useState, useEffect, useCallback } from "react";
import { apiLogin, apiSignup, apiLogout, apiGetMe, apiRefreshToken, apiVerifyEmail, apiResendVerification, setAuthToken, getAuthToken } from "../api";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  profile?: { name?: string } | null;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  needsVerification: string | null; // email that needs OTP verification
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);

  // On mount, check if we have a stored token and validate it
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    apiGetMe()
      .then(({ user }) => {
        setUser(user);
      })
      .catch(async () => {
        // Try refresh
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            const result = await apiRefreshToken(refreshToken);
            setAuthToken(result.accessToken);
            if (result.refreshToken) localStorage.setItem("refresh_token", result.refreshToken);
            setUser(result.user);
            return;
          } catch {}
        }
        // Both failed — clear tokens
        setAuthToken(null);
        localStorage.removeItem("refresh_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await apiLogin(email, password);
      setAuthToken(result.accessToken);
      if (result.refreshToken) localStorage.setItem("refresh_token", result.refreshToken);
      setUser(result.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
      throw err;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    setError(null);
    try {
      const result = await apiSignup(email, password, name);
      if (result.accessToken) {
        setAuthToken(result.accessToken);
        if (result.refreshToken) localStorage.setItem("refresh_token", result.refreshToken);
        setUser(result.user);
      } else {
        // Email verification required — show OTP input
        setNeedsVerification(email);
      }
    } catch (err: any) {
      const msg = err.message || "Signup failed";
      // If user already exists but unverified, resend verification and show OTP screen
      if (msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("already registered")) {
        try {
          await apiResendVerification(email);
          setNeedsVerification(email);
          return;
        } catch {
          // If resend fails too, show the original error
        }
      }
      setError(msg);
      throw err;
    }
  }, []);

  const verifyEmail = useCallback(async (email: string, otp: string) => {
    setError(null);
    try {
      const result = await apiVerifyEmail(email, otp);
      if (result.accessToken) {
        setAuthToken(result.accessToken);
        if (result.refreshToken) localStorage.setItem("refresh_token", result.refreshToken);
        setUser(result.user);
        setNeedsVerification(null);
      }
    } catch (err: any) {
      setError(err.message || "Verification failed");
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setAuthToken(null);
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    setError(null);
    try {
      await apiResendVerification(email);
      setError("New verification code sent!");
    } catch (err: any) {
      setError(err.message || "Failed to resend verification email");
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { user, loading, error, needsVerification, login, signup, verifyEmail, resendVerification, logout, clearError };
}
