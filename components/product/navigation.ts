export interface AppNavItem {
  label: string;
  href: string;
}

export interface AppNavGroup {
  title: string;
  items: AppNavItem[];
}

export const APP_NAV_GROUPS: AppNavGroup[] = [
  {
    title: "Core",
    items: [
      { label: "Dashboard", href: "/app" },
      { label: "Onboarding", href: "/app/onboarding" },
      { label: "Single Send", href: "/app/send/single" },
      { label: "Campaigns", href: "/app/campaigns" },
      { label: "Contacts", href: "/app/contacts" },
      { label: "Lists", href: "/app/lists" },
      { label: "Suppression", href: "/app/suppression" },
      { label: "Templates", href: "/app/templates" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Workspace Settings", href: "/app/settings/workspace" },
      { label: "Sender Settings", href: "/app/settings/sender" },
      { label: "Audit", href: "/app/audit" },
      { label: "Team", href: "/app/team" },
      { label: "Billing", href: "/app/billing" },
      { label: "Docs", href: "/app/docs" },
    ],
  },
];

export function getNavLabel(pathname: string): string {
  for (const group of APP_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === pathname) return item.label;
    }
  }

  if (pathname.startsWith("/app/campaigns/")) {
    return "Campaign Detail";
  }

  if (pathname.startsWith("/app/lists/")) {
    return "List Detail";
  }

  return "Workspace";
}
