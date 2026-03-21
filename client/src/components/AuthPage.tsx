import { useState, FormEvent } from "react";

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string) => Promise<void>;
  onVerify: (email: string, otp: string) => Promise<void>;
  onResend: (email: string) => Promise<void>;
  needsVerification: string | null;
  error: string | null;
  clearError: () => void;
}

export default function AuthPage({ onLogin, onSignup, onVerify, onResend, needsVerification, error, clearError }: AuthPageProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignup) {
        await onSignup(email, password, name);
      } else {
        await onLogin(email, password);
      }
    } catch {
      // Error is handled by parent via the error prop
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

  function toggleMode() {
    setIsSignup(!isSignup);
    clearError();
  }

  // OTP verification screen
  if (needsVerification) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#07080a]">
        <div className="w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-50 tracking-tight">Job Tracker</h1>
            <p className="text-gray-500 mt-2 text-sm">Verify your email</p>
          </div>

          <div className="bg-[#0d0f13] border border-gray-800 rounded-2xl p-8 shadow-2xl">
            <div className="mb-5 p-3 rounded-lg bg-blue-500/8 border border-blue-500/20 text-blue-400 text-sm">
              We sent a verification code to <span className="font-medium">{needsVerification}</span>. Enter it below to complete signup.
            </div>

            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-400 mb-1.5">
                  Verification Code
                </label>
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter the code from your email"
                  className="w-full bg-[#0f1115] border border-gray-800/60 rounded-lg px-4 py-3 text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all text-center text-lg tracking-widest"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg text-sm flex items-center gap-2 bg-red-500/8 border border-red-500/20 text-red-400">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !otp.trim()}
                className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Verifying..." : "Verify Email"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <span className="text-sm text-gray-500">
                Didn't get the code?{" "}
                <button
                  onClick={() => onResend(needsVerification!)}
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  Resend code
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Login / Signup screen
  return (
    <div className="h-screen flex items-center justify-center bg-[#07080a]">
      <div className="w-full max-w-md mx-4">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-50 tracking-tight">Job Tracker</h1>
          <p className="text-gray-500 mt-2 text-sm">
            {isSignup ? "Create your account" : "Sign in to your account"}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-[#0d0f13] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name (signup only) */}
            {isSignup && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-1.5">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#0f1115] border border-gray-800/60 rounded-lg px-4 py-3 text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  required
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0f1115] border border-gray-800/60 rounded-lg px-4 py-3 text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "Min 8 characters" : "Enter your password"}
                minLength={isSignup ? 8 : undefined}
                className="w-full bg-[#0f1115] border border-gray-800/60 rounded-lg px-4 py-3 text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
                required
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg text-sm flex items-center gap-2 bg-red-500/8 border border-red-500/20 text-red-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting
                ? (isSignup ? "Creating account..." : "Signing in...")
                : (isSignup ? "Create Account" : "Sign In")
              }
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <span className="text-sm text-gray-500">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={toggleMode}
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
