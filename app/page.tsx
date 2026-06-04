import Link from "next/link";
import { RootAuthHandoff } from "@/components/auth/root-auth-handoff";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <RootAuthHandoff />
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-600">
          BAAM Outreach
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
          Standalone outreach SaaS for safe, operator-controlled sending
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          This project is fully separated from BAAM Review and includes the complete page
          skeleton for auth, onboarding, campaigns, contacts, templates, settings, team,
          billing, docs, and legal pages.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Open app workspace
          </Link>
          <Link
            href="/prototypes/outreach-saas-v3"
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open design prototype
          </Link>
          <Link
            href="/docs/implementation-plan"
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            View implementation plan
          </Link>
        </div>
      </header>
    </main>
  );
}
