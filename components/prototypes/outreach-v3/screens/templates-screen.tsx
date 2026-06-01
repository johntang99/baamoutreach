import {
  V3Button,
  V3CheckList,
  V3Heading,
  V3Panel,
  V3SectionTitle,
} from "@/components/prototypes/outreach-v3/primitives";

const TEMPLATE_ITEMS = [
  {
    title: "TCM intro - concise",
    subtitle: "Business intro - EN - 3 variants",
    tone: "good",
    label: "Active",
  },
  {
    title: "Review request - warm",
    subtitle: "Review flow - EN/ZH - 2 variants",
    tone: "good",
    label: "Active",
  },
  {
    title: "Event invite - webinar",
    subtitle: "Event promotion - EN - 1 variant",
    tone: "warning",
    label: "Draft",
  },
] as const;

export function TemplatesScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Template Studio"
          description="Library and editor split inspired by modern messaging products: pick template, tune variables, and enforce compliance before activation."
          actions={
            <>
              <V3Button variant="secondary">Duplicate</V3Button>
              <V3Button>New template</V3Button>
            </>
          }
        />
      </V3Panel>

      <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <V3Panel className="space-y-3">
          <V3SectionTitle>Template library</V3SectionTitle>
          <V3CheckList items={[...TEMPLATE_ITEMS]} />
        </V3Panel>

        <V3Panel className="space-y-3">
          <V3SectionTitle>Selected template settings</V3SectionTitle>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Allowed variables
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {"{name}, {business_name}, {city}, {cta_link}"}
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Compliance footer
            </span>
            <span className="min-h-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
              You received this message because your business is publicly listed
              and relevant to this outreach.
              <br />
              To stop future outreach, click {"{unsubscribe_link}"}.
            </span>
          </label>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
            Promotional templates require unsubscribe token before activation.
            Validation runs automatically on save.
          </p>
        </V3Panel>
      </section>
    </div>
  );
}
