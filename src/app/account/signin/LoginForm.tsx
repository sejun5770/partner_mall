"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginId) {
      setError("아이디를 입력해주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loginId, password }),
      });

      if (res.ok) {
        const returnUrl = searchParams?.get("ReturnUrl") || "/dashboard";
        router.push(returnUrl.startsWith("/") ? returnUrl : "/dashboard");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "로그인에 실패했습니다.");
        setSubmitting(false);
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* ID */}
      <div className="relative">
        <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <input
          id="loginId"
          name="Id"
          type="text"
          autoComplete="username"
          required
          placeholder="아이디"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          className="block h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
        />
      </div>

      {/* PW */}
      <div className="relative">
        <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <input
          id="loginPw"
          name="Password"
          type={showPw ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-12 text-base text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          {showPw ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.77 21.77 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A10.78 10.78 0 0 1 12 4c7 0 11 8 11 8a21.71 21.71 0 0 1-3.16 4.19" />
              <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>

      {/* Error */}
      <div className="min-h-[1.5rem]" aria-live="polite">
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600">
            {error}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="block h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        {submitting ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
