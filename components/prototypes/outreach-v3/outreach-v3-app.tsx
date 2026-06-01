"use client";

import { type ReactNode, useMemo, useState } from "react";
import { V3_NAV_ITEMS } from "@/components/prototypes/outreach-v3/data";
import { BulkSendScreen } from "@/components/prototypes/outreach-v3/screens/bulk-send-screen";
import { ContactsScreen } from "@/components/prototypes/outreach-v3/screens/contacts-screen";
import { DashboardScreen } from "@/components/prototypes/outreach-v3/screens/dashboard-screen";
import { OnboardingScreen } from "@/components/prototypes/outreach-v3/screens/onboarding-screen";
import { SingleSendScreen } from "@/components/prototypes/outreach-v3/screens/single-send-screen";
import { TeamBillingScreen } from "@/components/prototypes/outreach-v3/screens/team-billing-screen";
import { TemplatesScreen } from "@/components/prototypes/outreach-v3/screens/templates-screen";
import {
  V3StatusBadge,
  V3TopChip,
} from "@/components/prototypes/outreach-v3/primitives";
import { cn } from "@/lib/utils";
import type { V3ScreenId } from "@/components/prototypes/outreach-v3/types";

const SCREEN_REGISTRY: Record<V3ScreenId, ReactNode> = {
  onboarding: <OnboardingScreen />,
  dashboard: <DashboardScreen />,
  "single-send": <SingleSendScreen />,
  "bulk-send": <BulkSendScreen />,
  templates: <TemplatesScreen />,
  contacts: <ContactsScreen />,
  "team-billing": <TeamBillingScreen />,
};

export function OutreachV3App() {
  const [activeScreen, setActiveScreen] = useState<V3ScreenId>("onboarding");

  const activeNav = useMemo(
    () => V3_NAV_ITEMS.find((item) => item.id === activeScreen),
    [activeScreen],
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen xl:grid-cols-[250px_1fr]">
        <aside className="flex flex-col gap-4 border-b border-slate-200 bg-slate-950 px-3 py-4 text-slate-100 xl:border-r xl:border-b-0">
          <div className="flex items-center gap-2 border-b border-slate-800 px-2 pb-3">
            <span className="grid size-7 place-items-center rounded-md bg-blue-600 text-xs font-bold text-white">
              BO
            </span>
            <span className="text-sm font-semibold tracking-wide">BAAM Outreach</span>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
            <p className="text-sm font-semibold text-slate-100">
              Natural Life Acupuncture
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Growth Plan - 4 seats - NYC
            </p>
          </section>

          <nav className="grid gap-1">
            <p className="px-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">
              Workspace
            </p>
            {V3_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveScreen(item.id)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  activeScreen === item.id
                    ? "bg-blue-600/25 font-semibold text-blue-100"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                <span>{item.label}</span>
                {item.count ? (
                  <span className="inline-flex min-w-4 rounded-full bg-blue-600/30 px-1.5 text-[10px] font-semibold text-blue-100">
                    {item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <section className="mt-auto grid gap-2">
            <p className="px-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">
              Safety
            </p>
            <article className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <div>
                <p className="text-xs font-medium">Daily budget</p>
                <p className="text-[11px] text-slate-400">42 / 100 recommended</p>
              </div>
              <V3StatusBadge tone="good" label="Healthy" />
            </article>
            <article className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <div>
                <p className="text-xs font-medium">Suppression list</p>
                <p className="text-[11px] text-slate-400">109 contacts blocked</p>
              </div>
              <V3StatusBadge tone="warning" label="Active" />
            </article>
          </section>
        </aside>

        <main className="flex min-h-screen min-w-0 flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Workspace</span>
                <span>/</span>
                <strong className="font-semibold text-slate-700">
                  Natural Life Acupuncture
                </strong>
                <span>/</span>
                <span>{activeNav?.label ?? "Outreach"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 lg:inline-flex">
                  Search contacts, templates, campaigns...
                </span>
                <V3TopChip label="Mode" value="Send in Gmail first" />
                <V3TopChip label="Role" value="Owner" />
              </div>
            </div>

            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
              {V3_NAV_ITEMS.map((item) => (
                <button
                  key={`tab-${item.id}`}
                  type="button"
                  onClick={() => setActiveScreen(item.id)}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    activeScreen === item.id
                      ? "border-blue-700 bg-blue-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {item.shortLabel ?? item.label}
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 p-3 sm:p-4">{SCREEN_REGISTRY[activeScreen]}</div>
        </main>
      </div>
    </div>
  );
}
