import {
  V3Button,
  V3DataTable,
  V3FilterChip,
  V3Heading,
  V3Panel,
  V3SectionTitle,
  V3StatusBadge,
} from "@/components/prototypes/outreach-v3/primitives";

const BULK_STEPS = [
  { step: "1. Audience", value: "500 rows selected" },
  { step: "2. Message", value: "3 variants ready" },
  { step: "3. Schedule", value: "100/day cap" },
  { step: "4. Review", value: "411 ready to queue" },
];

export function BulkSendScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Bulk Campaign Builder"
          description="Sequence-style builder with pacing and review controls before queue activation."
          actions={
            <>
              <V3Button variant="secondary">Dry run</V3Button>
              <V3Button>Prepare queue</V3Button>
            </>
          }
        />
      </V3Panel>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {BULK_STEPS.map((step) => (
          <article
            key={step.step}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {step.step}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{step.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1fr_300px]">
        <V3Panel className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <V3FilterChip>Segment: TCM NYC prospects</V3FilterChip>
            <V3FilterChip>Safety status: Show warnings</V3FilterChip>
            <V3FilterChip>Planned slots: This week</V3FilterChip>
          </div>

          <V3DataTable
            headers={["Recipient", "Segment", "Variant", "Safety status", "Planned slot"]}
            rows={[
              [
                <div key="recipient-1">
                  <p className="font-semibold text-slate-900">Queens Acu Center</p>
                  <p className="text-[11px] text-slate-500">owner@queensacu.com</p>
                </div>,
                "TCM NYC",
                "Intro A",
                <V3StatusBadge key="status-1" tone="good" label="Pass" />,
                "Today 10:20",
              ],
              [
                <div key="recipient-2">
                  <p className="font-semibold text-slate-900">WellSpring Herbs</p>
                  <p className="text-[11px] text-slate-500">contact@wellspringherbs.com</p>
                </div>,
                "TCM NYC",
                "Intro B",
                <V3StatusBadge key="status-2" tone="warning" label="Role risk" />,
                "Manual review",
              ],
              [
                <div key="recipient-3">
                  <p className="font-semibold text-slate-900">East River Therapy</p>
                  <p className="text-[11px] text-slate-500">admin@eastrivertherapy.com</p>
                </div>,
                "TCM NYC",
                "Intro C",
                <V3StatusBadge key="status-3" tone="danger" label="Suppressed" />,
                "Excluded",
              ],
            ]}
          />
        </V3Panel>

        <V3Panel className="space-y-3 bg-slate-50">
          <V3SectionTitle>Queue policy</V3SectionTitle>
          <div className="space-y-1 text-xs text-slate-600">
            <p>Recommended daily: 100</p>
            <p>Hard cap: 200</p>
            <p>Jitter: 120-180 sec between sends</p>
            <p>Auto-pause on bounce or complaint threshold</p>
          </div>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
            Every queue release requires explicit operator confirmation to avoid
            accidental blast behavior.
          </p>
        </V3Panel>
      </section>
    </div>
  );
}
