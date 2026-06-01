"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV_GROUPS, getNavLabel } from "@/components/product/navigation";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  workspaceName: string;
  roleLabel: string;
  userEmail: string;
}

export function AppShell({
  children,
  workspaceName,
  roleLabel,
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const currentLabel = getNavLabel(pathname);

  return (
    <div className="grid min-h-screen bg-slate-100 xl:grid-cols-[250px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 px-3 py-4 text-slate-200 xl:border-r xl:border-b-0">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-800 px-2 pb-3">
          <span className="grid size-7 place-items-center rounded-md bg-blue-600 text-xs font-bold text-white">
            BO
          </span>
          <div>
            <p className="text-sm font-semibold">BAAM Outreach</p>
            <p className="text-[11px] text-slate-400">Standalone SaaS</p>
          </div>
        </div>

        <div className="space-y-4">
          {APP_NAV_GROUPS.map((group) => (
            <nav key={group.title} className="space-y-1">
              <p className="px-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                {group.title}
              </p>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-blue-600/25 text-blue-100"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ))}
        </div>

        <div className="mt-6 space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <p className="font-semibold text-slate-100">Execution Status</p>
          <p className="text-slate-400">Design baseline: complete</p>
          <p className="text-slate-400">MVP build: phase 1 in progress</p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Workspace</span>
              <span>/</span>
              <span className="font-semibold text-slate-700">{workspaceName}</span>
              <span>/</span>
              <span>{currentLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 lg:inline-flex">
                User: <strong className="ml-1 font-semibold text-slate-700">{userEmail}</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                Mode: <strong className="font-semibold text-slate-700">Send in Gmail first</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                Role: <strong className="font-semibold text-slate-700">{roleLabel}</strong>
              </span>
              <Link
                href="/auth/signout"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
              >
                Sign out
              </Link>
            </div>
          </div>
        </header>
        <div className="p-3 sm:p-4">{children}</div>
      </main>
    </div>
  );
}
