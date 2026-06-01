import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  StatusTone,
  V3Metric,
} from "@/components/prototypes/outreach-v3/types";

const toneStyles: Record<StatusTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
};

export function V3Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function V3Heading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function V3Button({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold transition-colors",
        variant === "primary"
          ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-700"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

export function V3TopChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
      <span>{label}:</span>
      <strong className="font-semibold text-slate-700">{value}</strong>
    </span>
  );
}

export function V3MetricGrid({ metrics }: { metrics: V3Metric[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {metric.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {metric.value}
          </p>
          <p className="text-[11px] text-slate-500">{metric.detail}</p>
        </article>
      ))}
    </div>
  );
}

export function V3StatusBadge({
  tone,
  label,
}: {
  tone: StatusTone;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        toneStyles[tone],
      )}
    >
      {label}
    </span>
  );
}

export function V3CheckList({
  items,
}: {
  items: Array<{ title: string; subtitle: string; tone: StatusTone; label: string }>;
}) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <article
          key={item.title}
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-slate-900">{item.title}</p>
            <p className="text-xs text-slate-500">{item.subtitle}</p>
          </div>
          <V3StatusBadge tone={item.tone} label={item.label} />
        </article>
      ))}
    </div>
  );
}

export function V3ProgressRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="grid grid-cols-[132px_1fr_44px] items-center gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-right font-semibold text-slate-700">{value}%</span>
    </div>
  );
}

export function V3FilterChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
      {children}
    </span>
  );
}

export function V3DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border-b border-slate-200 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="bg-white">
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${rowIndex}-${cellIndex}`}
                  className="border-b border-slate-200 px-3 py-2 align-top text-slate-700 last:border-b-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function V3SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-900">{children}</h3>;
}
