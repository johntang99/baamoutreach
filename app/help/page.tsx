import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Help Center</h1>
        <p className="mt-2 text-sm text-slate-500">
          Guides for setup, sending operations, and policy compliance.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link href="/app/docs" className="text-blue-600 hover:text-blue-700">
              In-app docs index
            </Link>
          </li>
          <li>
            <Link href="/legal/privacy" className="text-blue-600 hover:text-blue-700">
              Privacy policy
            </Link>
          </li>
          <li>
            <Link href="/legal/terms" className="text-blue-600 hover:text-blue-700">
              Terms of service
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
