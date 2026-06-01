import {
  ActionButton,
  BulletList,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/product/page-primitives";

export default function DashboardPage() {
  return (
    <div className="grid gap-3">
      <PageHeader
        title="Dashboard"
        description="Daily operating view for outreach volume, deliverability, and conversion signals."
        actions={
          <>
            <ActionButton variant="secondary">Last 7 days</ActionButton>
            <ActionButton>Create campaign</ActionButton>
          </>
        }
      />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent today" value="42" detail="/100 recommended" />
        <StatCard label="Open rate" value="61%" detail="+6.4% week over week" />
        <StatCard label="Reply rate" value="17%" detail="Stable in safe range" />
        <StatCard label="Risk score" value="Low" detail="No hard-stop triggers" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Campaign performance">
          <BulletList
            items={[
              "TCM Intro - NYC Batch A: open 65%, reply 19%, risk low",
              "Dental Review Invite - May: open 59%, reply 14%, risk low",
              "Webinar Follow-up: open 48%, reply 9%, risk medium",
            ]}
          />
        </SectionCard>
        <SectionCard title="Immediate actions">
          <BulletList
            items={[
              "Reduce this hour to max 6 sends for warm-up safety.",
              "Review 13 role-based addresses (info@, office@).",
              "Rotate Variant B to avoid template fatigue.",
            ]}
          />
        </SectionCard>
      </section>
    </div>
  );
}
