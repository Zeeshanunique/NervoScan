"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { getLocale, setLocale, t, type Locale, LOCALES } from "@/app/lib/i18n";
import { getStoredToken, clearStoredToken } from "@/app/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AuthUser {
  user_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export default function Navbar() {
  const pathname = usePathname();
  const [locale, setLoc] = useState<Locale>("en");
  const [langOpen, setLangOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoc(getLocale());
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setAuthLoaded(true);
      return;
    }
    fetch(`${API_URL}/auth/me?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setAuthLoaded(true));
  }, [pathname]);

  useEffect(() => {
    const handler = () => {
      const token = getStoredToken();
      if (!token) setUser(null);
      else {
        fetch(`${API_URL}/auth/me?token=${encodeURIComponent(token)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => setUser(data))
          .catch(() => setUser(null));
      }
    };
    window.addEventListener("nervoscan-auth-change", handler);
    return () => window.removeEventListener("nervoscan-auth-change", handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectLocale = (l: Locale) => {
    setLocale(l);
    setLoc(l);
    setLangOpen(false);
  };

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    window.dispatchEvent(new CustomEvent("nervoscan-auth-change"));
  };

  const links = [
    { href: "/", label: t("nav.home", locale), icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/assessment", label: t("nav.assessment", locale), icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { href: "/reports", label: t("nav.reports", locale), icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    ...(user ? [{ href: "/admin", label: t("nav.admin", locale), icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" }] : []),
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            NervoScan
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === link.href
                  ? "bg-indigo-500/10 text-indigo-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
              </svg>
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          ))}

          {authLoaded && (
            <>
              {user ? (
                <div className="flex items-center gap-2 ml-2">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/80">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-indigo-500/50 flex items-center justify-center text-xs font-medium text-indigo-300">
                        {(user.name || user.email || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <span className="hidden sm:inline text-sm text-slate-300 max-w-[120px] truncate">
                      {user.name || user.email || "User"}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    {t("nav.logout", locale)}
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className={`ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === "/login"
                      ? "bg-indigo-500/10 text-indigo-400"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                >
                  {t("nav.login", locale)}
                </Link>
              )}
            </>
          )}

          <div className="relative ml-2" ref={dropdownRef}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-1"
            >
              {LOCALES.find((l) => l.code === locale)?.label || locale.toUpperCase()}
              <svg className={`w-3 h-3 transition-transform ${langOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-1 py-1 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                {LOCALES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => selectLocale(l.code)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors ${locale === l.code ? "text-indigo-400 bg-slate-700/50" : "text-slate-300"}`}
                  >
                    <span className="font-medium">{l.label}</span>
                    <span className="text-slate-500 text-xs ml-2">{l.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
