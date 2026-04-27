import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "바른손몰 B2B - 로그인",
};

/**
 * Sign-in page. Friendly card layout (배민상회 톤): warm cream backdrop,
 * mint accents, generous rounding, big inviting CTA. LoginForm is wrapped
 * in <Suspense> because it reads useSearchParams (ReturnUrl), which forces
 * client rendering and would otherwise fail Next's CSR-bailout check.
 */
export default function SignInPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-amber-50">
      {/* Soft decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-emerald-200/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-amber-200/60 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-rose-100/60 blur-3xl"
      />

      <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-2xl shadow-lg shadow-emerald-500/20"
          >
            👋
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            안녕하세요!
          </h1>
          <p className="text-sm text-slate-500">바른손몰 B2B 파트너 로그인</p>
        </div>

        {/* Card */}
        <section className="w-full rounded-3xl bg-white p-7 shadow-xl shadow-slate-900/5 ring-1 ring-slate-100">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </section>

        {/* Help footer */}
        <div className="mt-6 w-full rounded-2xl bg-white/70 p-4 text-center text-xs text-slate-500 backdrop-blur">
          <p>도움이 필요하신가요?</p>
          <p className="mt-1">
            <span className="text-slate-400">이메일 ·</span>{" "}
            <a
              href="mailto:developer@barunn.net"
              className="text-emerald-700 hover:underline"
            >
              developer@barunn.net
            </a>
            <span className="mx-2 text-slate-300">|</span>
            <span className="text-slate-400">전화 ·</span>{" "}
            <span className="text-slate-700">1644-7413</span>
          </p>
        </div>

        <p className="mt-8 text-[11px] text-slate-400">
          © (주)바른컴퍼니
        </p>
      </main>
    </div>
  );
}
