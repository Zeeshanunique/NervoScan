"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getLocale, t, type Locale } from "@/app/lib/i18n";
import { getStoredToken, setStoredToken } from "@/app/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ERROR_MESSAGES: Record<string, string> = {
  config: "Login is not configured. Please set up Google OAuth.",
  no_code: "No authorization code received.",
  token_exchange: "Failed to exchange code for token.",
  no_token: "No access token received.",
  userinfo: "Failed to fetch user profile.",
  invalid_profile: "Invalid user profile from Google.",
  access_denied: "Access denied.",
  invalid_credentials: "Invalid email or password.",
  email_exists: "Email already registered.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocale(getLocale());
    const handler = () => setLocale(getLocale());
    window.addEventListener("nervoscan-locale-change", handler);
    return () => window.removeEventListener("nervoscan-locale-change", handler);
  }, []);

  useEffect(() => {
    const token = searchParams.get("token");
    const success = searchParams.get("success");
    const redirect = searchParams.get("redirect");
    
    if (token && success === "1") {
      setStoredToken(token);
      window.dispatchEvent(new CustomEvent("nervoscan-auth-change"));
      window.location.replace(redirect || "/");
    }
    
    const errorParam = searchParams.get("error");
    const detail = searchParams.get("detail");
    if (errorParam) {
      const errorMsg = detail
        ? `${ERROR_MESSAGES[errorParam] || errorParam}: ${decodeURIComponent(detail)}`
        : (ERROR_MESSAGES[errorParam] || errorParam);
      setError(errorMsg);
    }
  }, [searchParams]);

  const handleGoogleLogin = () => {
    const redirect = searchParams.get("redirect");
    const redirectParam = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    window.location.href = `${API_URL}/auth/google${redirectParam}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" 
        ? { email, password }
        : { email, password, name };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400 && data.detail?.includes("already registered")) {
          setError(ERROR_MESSAGES.email_exists);
        } else if (res.status === 401) {
          setError(ERROR_MESSAGES.invalid_credentials);
        } else {
          setError(data.detail || "An error occurred");
        }
        return;
      }

      if (data.token) {
        setStoredToken(data.token);
        window.dispatchEvent(new CustomEvent("nervoscan-auth-change"));
        const redirect = searchParams.get("redirect");
        window.location.replace(redirect || "/");
      }
    } catch (err) {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/25">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-white">
            {mode === "login" ? t("login.title", locale) : "Create Account"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === "login" 
              ? t("login.subtitle", locale)
              : "Sign up to save your stress reports and track progress"
            }
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          {mode === "register" && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          )}
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all"
          >
            {loading ? "Processing..." : mode === "login" ? "Sign in" : "Create Account"}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-slate-950 text-slate-400">or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-all hover:border-indigo-500/50"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {t("login.googleSignIn", locale)}
        </button>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            {mode === "login" 
              ? "Don't have an account? Sign up" 
              : "Already have an account? Sign in"
            }
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          {t("login.privacyNote", locale)}
        </p>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← {t("nav.home", locale)}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
