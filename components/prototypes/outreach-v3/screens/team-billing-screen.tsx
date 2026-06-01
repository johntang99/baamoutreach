import {
  V3Button,
  V3DataTable,
  V3Heading,
  V3Panel,
  V3SectionTitle,
  V3StatusBadge,
} from "@/components/prototypes/outreach-v3/primitives";

const PLANS = [
  {
    name: "Starter",
    price: "$39",
    features: ["1 seat", "100 sends/day", "Single send + templates"],
    featured: false,
  },
  {
    name: "Growth",
    price: "$99",
    features: ["5 seats", "200 sends/day", "Bulk campaigns + segmentation"],
    featured: true,
  },
  {
    name: "Scale",
    price: "$249",
    features: ["15 seats", "Custom policy thresholds", "Approvals + audit export"],
    featured: false,
  },
];

export function TeamBillingScreen() {
  return (
    <div className="grid gap-3">
      <V3Panel>
        <V3Heading
          title="Team, Roles and Billing"
          description="Self-serve multi-tenant operations: seat-level access and Stripe-style plan controls."
          actions={
            <>
              <V3Button variant="secondary">Billing history</V3Button>
              <V3Button>Invite teammate</V3Button>
            </>
          }
        />
      </V3Panel>

      <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <V3Panel className="space-y-3">
          <V3SectionTitle>Members</V3SectionTitle>
          <V3DataTable
            headers={["User", "Role", "Status", "Last active"]}
            rows={[
              [
                <strong key="user">john@baamplatform.com</strong>,
                "Owner",
                <V3StatusBadge key="status" tone="good" label="Active" />,
                "Now",
              ],
              [
                <strong key="user">ops@naturallife.com</strong>,
                "Operator",
                <V3StatusBadge key="status" tone="good" label="Active" />,
                "2h ago",
              ],
              [
                <strong key="user">manager@naturallife.com</strong>,
                "Viewer",
                <V3StatusBadge key="status" tone="warning" label="Invited" />,
                "-",
              ],
            ]}
          />
        </V3Panel>

        <V3Panel className="space-y-3">
          <V3SectionTitle>Plan and entitlements</V3SectionTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={[
                  "rounded-xl border p-3",
                  plan.featured
                    ? "border-blue-200 bg-blue-50"
                    : "border-slate-200 bg-white",
                ].join(" ")}
              >
                <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {plan.price}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
            Entitlement checks run server-side on every send action: seat cap,
            daily limit, mode permissions, and billing state.
          </p>
        </V3Panel>
      </section>
    </div>
  );
}
