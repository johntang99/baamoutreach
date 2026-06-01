import {
  DASHBOARD_METRICS,
  IMMEDIATE_ACTIONS,
} from "@/components/prototypes/outreach-v3/data";
import {
  V3Button,
  V3CheckList,
  V3DataTable,
  V3FilterChip,
  V3Heading,
  V3MetricGrid,
  V3Panel,
  V3ProgressRow,
  V3SectionTitle,
  V3StatusBadge,
} from "@/components/prototypes/outreach-v3/primitives";

export function DashboardScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Operations Dashboard"
          description="Data-first operating view for daily decisions: campaign mix, risk signals, and table-level drilldown."
          actions={
            <>
              <V3Button variant="secondary">Last 7 days</V3Button>
              <V3Button>Create campaign</V3Button>
            </>
          }
        />
      </V3Panel>

      <V3MetricGrid metrics={DASHBOARD_METRICS} />

      <section className="grid gap-3 xl:grid-cols-[1.45fr_1fr]">
        <V3Panel className="space-y-3">
          <V3SectionTitle>Campaign mix</V3SectionTitle>
          <div className="grid gap-2">
            <V3ProgressRow label="Review requests" value={56} />
            <V3ProgressRow label="Business intro" value={28} />
            <V3ProgressRow label="Product promo" value={11} />
            <V3ProgressRow label="Event invites" value={5} />
          </div>
        </V3Panel>

        <V3Panel className="space-y-3">
          <V3SectionTitle>Immediate actions</V3SectionTitle>
          <V3CheckList items={IMMEDIATE_ACTIONS} />
        </V3Panel>
      </section>

      <V3Panel className="space-y-3">
        <V3SectionTitle>Campaign performance table</V3SectionTitle>
        <div className="flex flex-wrap gap-2">
          <V3FilterChip>Type: All campaigns</V3FilterChip>
          <V3FilterChip>Status: Active</V3FilterChip>
          <V3FilterChip>Date: Last 30 days</V3FilterChip>
          <V3FilterChip>Owner: Any</V3FilterChip>
        </div>
        <V3DataTable
          headers={["Campaign", "Audience", "Sent", "Open", "Reply", "Risk", "Owner"]}
          rows={[
            [
              <strong key="campaign">TCM Intro - NYC Batch A</strong>,
              "TCM NYC",
              "138",
              "65%",
              "19%",
              <V3StatusBadge key="risk" tone="good" label="Low" />,
              "John",
            ],
            [
              <strong key="campaign">Dental Review Invite - May</strong>,
              "Dental Tri-state",
              "92",
              "59%",
              "14%",
              <V3StatusBadge key="risk" tone="good" label="Low" />,
              "Ops",
            ],
            [
              <strong key="campaign">Webinar Follow-up</strong>,
              "Warm leads",
              "44",
              "48%",
              "9%",
              <V3StatusBadge key="risk" tone="warning" label="Med" />,
              "John",
            ],
          ]}
        />
      </V3Panel>
    </div>
  );
}
