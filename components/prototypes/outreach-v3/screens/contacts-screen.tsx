import { CONTACTS_METRICS } from "@/components/prototypes/outreach-v3/data";
import {
  V3Button,
  V3DataTable,
  V3FilterChip,
  V3Heading,
  V3MetricGrid,
  V3Panel,
  V3SectionTitle,
  V3StatusBadge,
} from "@/components/prototypes/outreach-v3/primitives";

export function ContactsScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Contacts and Lists"
          description="Table-first contact intelligence with filtering, segmentation, and suppression controls."
          actions={
            <>
              <V3Button variant="secondary">Import CSV</V3Button>
              <V3Button>Create segment</V3Button>
            </>
          }
        />
      </V3Panel>

      <V3MetricGrid metrics={CONTACTS_METRICS} />

      <V3Panel className="space-y-3">
        <V3SectionTitle>Segment health</V3SectionTitle>
        <div className="flex flex-wrap gap-2">
          <V3FilterChip>Industry: All</V3FilterChip>
          <V3FilterChip>Location: New York</V3FilterChip>
          <V3FilterChip>Source: CSV + Manual</V3FilterChip>
          <V3FilterChip>Status: Deliverable only</V3FilterChip>
        </div>
        <V3DataTable
          headers={["Segment", "Rule", "Count", "Last refresh", "Status"]}
          rows={[
            [
              <strong key="segment">TCM NYC Prospects</strong>,
              "industry=TCM AND city=New York",
              "500",
              "2 hours ago",
              <V3StatusBadge key="status" tone="good" label="Ready" />,
            ],
            [
              <strong key="segment">Dental Tri-State</strong>,
              "industry=Dental AND state in (NY,NJ,CT)",
              "312",
              "Yesterday",
              <V3StatusBadge key="status" tone="good" label="Ready" />,
            ],
            [
              <strong key="segment">Event Warm List</strong>,
              "opened_last_30d=true",
              "184",
              "40 mins ago",
              <V3StatusBadge key="status" tone="neutral" label="Synced" />,
            ],
          ]}
        />
      </V3Panel>
    </div>
  );
}
