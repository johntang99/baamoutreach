import { ONBOARDING_CHECKLIST } from "@/components/prototypes/outreach-v3/data";
import {
  V3Button,
  V3CheckList,
  V3Heading,
  V3Panel,
  V3ProgressRow,
  V3SectionTitle,
} from "@/components/prototypes/outreach-v3/primitives";

const ONBOARDING_STEPS = [
  { title: "Step 1", value: "Workspace profile complete" },
  { title: "Step 2", value: "Sender mailbox verified" },
  { title: "Step 3", value: "138 contacts imported" },
  { title: "Step 4", value: "First template approved" },
];

export function OnboardingScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Checklist Onboarding"
          description="Stripe-inspired first-run flow: clear status cards, launch gates, and short paths to first successful outbound send."
          actions={
            <>
              <V3Button variant="secondary">View setup guide</V3Button>
              <V3Button>Resume setup</V3Button>
            </>
          }
        />
      </V3Panel>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ONBOARDING_STEPS.map((step) => (
          <article
            key={step.title}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {step.title}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{step.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.45fr_1fr]">
        <V3Panel className="space-y-3">
          <V3SectionTitle>Launch checklist</V3SectionTitle>
          <V3CheckList items={ONBOARDING_CHECKLIST} />
        </V3Panel>

        <V3Panel className="space-y-3">
          <V3SectionTitle>Quality gates</V3SectionTitle>
          <div className="grid gap-2">
            <V3ProgressRow label="Auth setup" value={100} />
            <V3ProgressRow label="Template health" value={88} />
            <V3ProgressRow label="List quality" value={91} />
            <V3ProgressRow label="Pacing policy" value={76} />
          </div>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
            Recommendation: keep week-one traffic under 20/day, prefer Send in
            Gmail, and manually review role emails before queue release.
          </p>
        </V3Panel>
      </section>
    </div>
  );
}
