import Link from "next/link";

const PHASES = [
  {
    name: "Phase 0 - Separation Foundation",
    items: [
      "Independent codebase and deployment target",
      "Independent environment variables and secrets",
      "Independent datastore and billing namespace",
    ],
  },
  {
    name: "Phase 1 - Product Skeleton",
    items: [
      "All core route skeletons and app navigation",
      "Shared page primitives and design consistency",
      "State-aware low-fi screens for every key page",
    ],
  },
  {
    name: "Phase 2 - Authentication and Tenancy",
    items: [
      "Signup/login/reset integration",
      "Workspace and membership model",
      "Protected route boundaries",
    ],
  },
  {
    name: "Phase 3-7 - Feature Delivery to Launch",
    items: [
      "Single send MVP and bulk campaign MVP",
      "Policy/compliance enforcement and audit trails",
      "Team, billing, hardening, and release readiness",
    ],
  },
];

export default function ImplementationPlanPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          BAAM Outreach Implementation Plan
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This roadmap is the execution baseline for building BAAM Outreach as a fully
          standalone SaaS product.
        </p>
        <div className="mt-5 grid gap-3">
          {PHASES.map((phase) => (
            <article key={phase.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-900">{phase.name}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {phase.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-600">
          Full details are in repository docs:{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            docs/IMPLEMENTATION_PLAN.md
          </code>
          , with migration SQL in{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            supabase/migrations/0001_workspace_tenancy.sql
          </code>
          .
        </p>
        <div className="mt-4">
          <Link href="/app" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Go to app workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
