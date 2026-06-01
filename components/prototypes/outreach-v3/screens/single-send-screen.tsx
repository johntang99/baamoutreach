import {
  V3Button,
  V3CheckList,
  V3Heading,
  V3Panel,
  V3SectionTitle,
} from "@/components/prototypes/outreach-v3/primitives";

const SINGLE_SEND_CHECKS = [
  { title: "Suppression", subtitle: "No blocks found", tone: "good", label: "Pass" },
  {
    title: "Cadence window",
    subtitle: "Interval policy respected",
    tone: "good",
    label: "Pass",
  },
  {
    title: "Template risk",
    subtitle: "No spam trigger phrases",
    tone: "good",
    label: "Pass",
  },
  {
    title: "Recipient quality",
    subtitle: "Decision-maker mailbox detected",
    tone: "good",
    label: "Pass",
  },
] as const;

export function SingleSendScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Single Send Composer"
          description="Composer-left and compliance-right layout, designed for fast execution with visible guardrails."
          actions={
            <>
              <V3Button variant="secondary">Save draft</V3Button>
              <V3Button>Send in Gmail</V3Button>
            </>
          }
        />
      </V3Panel>

      <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <V3Panel className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: "Campaign type", value: "Review request" },
              { label: "Source segment", value: "TCM prospects NYC" },
              { label: "Recipient name", value: "Dr. Lin" },
              { label: "Recipient email", value: "drlin@example.com" },
              { label: "Template", value: "TCM intro - concise" },
              { label: "Tone", value: "Professional" },
            ].map((field) => (
              <label key={field.label} className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {field.label}
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {field.value}
                </span>
              </label>
            ))}
          </div>

          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Subject
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Dr. Lin, quick idea to improve review volume safely
            </span>
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Body
            </span>
            <span className="min-h-44 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
              Hi Dr. Lin,
              <br />
              <br />
              I work with NYC clinics that want more high-quality Google reviews
              without risky bulk-email behavior.
              <br />
              <br />
              If helpful, I can share a 10-minute walkthrough specifically for TCM
              practices this week.
              <br />
              <br />
              Best,
              <br />
              John
            </span>
          </label>
        </V3Panel>

        <V3Panel className="space-y-3">
          <V3SectionTitle>Pre-send checks</V3SectionTitle>
          <V3CheckList items={[...SINGLE_SEND_CHECKS]} />
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p>
              <strong className="text-slate-800">Preview sender:</strong>{" "}
              support@baamplatform.com
            </p>
            <p>
              <strong className="text-slate-800">Tracking:</strong> Open tracking
              on, unsubscribe token on
            </p>
            <p>
              <strong className="text-slate-800">Final action:</strong> Opens
              Gmail compose with fields prefilled
            </p>
          </div>
        </V3Panel>
      </section>
    </div>
  );
}
