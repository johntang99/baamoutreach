import Link from "next/link";
import {
  BulletList,
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";

export default function DocsPage() {
  return (
    <div className="grid gap-3">
      <PageHeader
        title="Docs"
        description="Operational guides for daily usage, safety, and delivery quality."
      />

      <section className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Operator guides">
          <BulletList
            items={[
              "Single send workflow",
              "Bulk campaign release workflow",
              "Suppression handling and policy exceptions",
              "Audit review workflow and escalation",
            ]}
          />
        </SectionCard>
        <SectionCard title="Related pages">
          <div className="space-y-2 text-sm">
            <Link href="/app/audit" className="block text-blue-600 hover:text-blue-700">
              Workspace Audit
            </Link>
            <Link href="/app/settings/workspace" className="block text-blue-600 hover:text-blue-700">
              Workspace Policy Settings
            </Link>
            <Link href="/help" className="block text-blue-600 hover:text-blue-700">
              Public Help Center
            </Link>
            <Link href="/legal/privacy" className="block text-blue-600 hover:text-blue-700">
              Privacy Policy
            </Link>
            <Link href="/legal/terms" className="block text-blue-600 hover:text-blue-700">
              Terms of Service
            </Link>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
