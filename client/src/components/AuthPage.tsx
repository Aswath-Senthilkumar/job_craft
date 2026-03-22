import { useState, FormEvent } from "react";

type AuthView = "login" | "signup" | "verify" | "forgot" | "reset" | "reset-success";

function AuthWrapper({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="h-screen flex items-center justify-center bg-[#07080a]">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-50 tracking-tight">Job Tracker</h1>
          <p className="text-gray-500 mt-2 text-sm">{subtitle}</p>
        </div>
        <div className="bg-[#0d0f13] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="p-3 rounded-lg text-sm flex items-center gap-2 bg-red-500/8 border border-red-500/20 text-red-400">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {error}
    </div>
  );
}

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string) => Promise<void>;
  onVerify: (email: string, otp: string) => Promise<void>;
  onResend: (email: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  onResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  needsVerification: string | null;
  error: string | null;
  clearError: () => void;
}

export default function AuthPage({
  onLogin, onSignup, onVerify, onResend, onForgotPassword, onResetPassword,
  needsVerification, error, clearError,
}: AuthPageProps) {
  const [view, setView] = useState<AuthView>(needsVerification ? "verify" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sync external verification state
  if (needsVerification && view !== "verify") setView("verify");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (view === "signup") {
        await onSignup(email, password, name);
      } else {
        await onLogin(email, password);
      }
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!needsVerification) return;
    setSubmitting(true);
    try {
      await onVerify(needsVerification, otp);
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onForgotPassword(email);
      setResetEmail(email);
      clearError();
      setView("reset");
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) return;
    setSubmitting(true);
    try {
      await onResetPassword(resetEmail, resetCode, password);
      clearError();
      setView("reset-success");
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  }

  function switchView(v: AuthView) {
    setView(v);
    clearError();
  }

  const inputCls = "w-full bg-[#0f1115] border border-gray-800/60 rounded-lg px-4 py-3 text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all";

  // ── OTP verification ──────────────────────────────────────────────
  if (view === "verify") {
    return (
      <AuthWrapper subtitle="Verify your email">
        <div className="mb-5 p-3 rounded-lg bg-blue-500/8 border border-blue-500/20 text-blue-400 text-sm">
          We sent a verification code to <span className="font-medium">{needsVerification}</span>. Enter it below to complete signup.
        </div>
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Verification Code</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter the code from your email"
              className={`${inputCls} text-center text-lg tracking-widest`}
              autoFocus
              required
            />
          </div>
          <ErrorBox error={error} />
          <button type="submit" disabled={submitting || !otp.trim()} className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {submitting ? "Verifying..." : "Verify Email"}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-500">
          Didn't get the code?{" "}
          <button onClick={() => onResend(needsVerification!)} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Resend code
          </button>
        </div>
      </AuthWrapper>
    );
  }

  // ── Forgot password ───────────────────────────────────────────────
  if (view === "forgot") {
    return (
      <AuthWrapper subtitle="Reset your password">
        <p className="text-sm text-gray-500 mb-5">Enter your email and we'll send you a reset code.</p>
        <form onSubmit={handleForgot} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
              autoFocus
              required
            />
          </div>
          <ErrorBox error={error} />
          <button type="submit" disabled={submitting || !email.trim()} className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {submitting ? "Sending..." : "Send Reset Code"}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-500">
          <button onClick={() => switchView("login")} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Back to sign in
          </button>
        </div>
      </AuthWrapper>
    );
  }

  // ── Reset password (enter code + new password) ────────────────────
  if (view === "reset") {
    const mismatch = confirmPassword && password !== confirmPassword;
    return (
      <AuthWrapper subtitle="Set a new password">
        <div className="mb-5 p-3 rounded-lg bg-blue-500/8 border border-blue-500/20 text-blue-400 text-sm">
          We sent a reset code to <span className="font-medium">{resetEmail}</span>. Enter it below with your new password.
        </div>
        <form onSubmit={handleReset} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Reset Code</label>
            <input
              type="text"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              placeholder="Enter the code from your email"
              className={`${inputCls} text-center text-lg tracking-widest`}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              className={`${inputCls} ${mismatch ? "border-red-500/40" : ""}`}
              required
            />
            {mismatch && <p className="text-xs text-red-400 mt-1">Passwords do not match</p>}
          </div>
          <ErrorBox error={error} />
          <button
            type="submit"
            disabled={submitting || !resetCode.trim() || !password || !!mismatch}
            className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Resetting..." : "Reset Password"}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-500">
          Didn't get the code?{" "}
          <button onClick={() => switchView("forgot")} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Try again
          </button>
        </div>
      </AuthWrapper>
    );
  }

  // ── Reset success ─────────────────────────────────────────────────
  if (view === "reset-success") {
    return (
      <AuthWrapper subtitle="Password updated">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-300 text-sm">Your password has been reset successfully.</p>
          <button
            onClick={() => switchView("login")}
            className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            Sign In
          </button>
        </div>
      </AuthWrapper>
    );
  }

  // ── Login / Signup ────────────────────────────────────────────────
  return (
    <AuthWrapper subtitle={view === "signup" ? "Create your account" : "Sign in to your account"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {view === "signup" && (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className={inputCls}
              required
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputCls}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-400">Password</label>
            {view === "login" && (
              <button
                type="button"
                onClick={() => switchView("forgot")}
                className="text-xs text-gray-600 hover:text-blue-400 transition-colors"
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={view === "signup" ? "Min 8 characters" : "Enter your password"}
            minLength={view === "signup" ? 8 : undefined}
            className={inputCls}
            required
          />
        </div>
        <ErrorBox error={error} />
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? (view === "signup" ? "Creating account..." : "Signing in...")
            : (view === "signup" ? "Create Account" : "Sign In")}
        </button>
      </form>
      <div className="mt-6 text-center text-sm text-gray-500">
        {view === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          onClick={() => switchView(view === "signup" ? "login" : "signup")}
          className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          {view === "signup" ? "Sign in" : "Sign up"}
        </button>
      </div>
    </AuthWrapper>
  );
}
