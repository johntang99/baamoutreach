export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Pricing</h1>
        <p className="mt-2 text-sm text-slate-500">
          Plan matrix for standalone BAAM Outreach.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            ["Starter", "$39", "1 seat, 100/day"],
            ["Growth", "$99", "5 seats, 200/day"],
            ["Scale", "$249", "15 seats, custom policy"],
          ].map(([name, price, detail]) => (
            <article key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{name}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{price}</p>
              <p className="text-xs text-slate-500">{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
