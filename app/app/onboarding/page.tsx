import {
  ActionButton,
  BulletList,
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";

export default function OnboardingPage() {
  return (
    <div className="grid gap-3">
      <PageHeader
        title="Onboarding"
        description="Non-linear checklist that gets a new workspace from signup to first successful send."
        actions={
          <>
            <ActionButton variant="secondary">View setup guide</ActionButton>
            <ActionButton>Resume setup</ActionButton>
          </>
        }
      />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          "Workspace profile complete",
          "Sender mailbox verified",
          "138 contacts imported",
          "First template approved",
        ].map((item, index) => (
          <article key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Step {index + 1}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Launch checklist">
          <BulletList
            items={[
              "Campaign types configured (review, promo, event).",
              "Suppression seed imported from previous source.",
              "Safety policy acknowledged and saved.",
              "Send test to owner mailbox pending.",
            ]}
          />
        </SectionCard>
        <SectionCard title="Quality gates">
          <BulletList
            items={[
              "Auth setup: 100%",
              "Template health: 88%",
              "List quality: 91%",
              "Pacing policy: 76%",
            ]}
          />
        </SectionCard>
      </section>
    </div>
  );
}
