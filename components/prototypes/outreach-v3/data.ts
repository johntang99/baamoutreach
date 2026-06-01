import type {
  V3CheckItem,
  V3Metric,
  V3NavItem,
} from "@/components/prototypes/outreach-v3/types";

export const V3_NAV_ITEMS: V3NavItem[] = [
  { id: "onboarding", label: "Onboarding", shortLabel: "Onboarding" },
  { id: "dashboard", label: "Dashboard", shortLabel: "Dashboard" },
  { id: "single-send", label: "Send One", shortLabel: "Send One" },
  { id: "bulk-send", label: "Campaigns", shortLabel: "Bulk", count: 3 },
  { id: "templates", label: "Templates", shortLabel: "Templates" },
  { id: "contacts", label: "Contacts", shortLabel: "Contacts" },
  { id: "team-billing", label: "Team & Billing", shortLabel: "Team/Billing" },
];

export const DASHBOARD_METRICS: V3Metric[] = [
  { label: "Sent today", value: "42", detail: "/100 recommended" },
  { label: "Open rate", value: "61%", detail: "+6.4% week over week" },
  { label: "Reply rate", value: "17%", detail: "Stable in safe range" },
  { label: "Risk score", value: "Low", detail: "No hard-stop triggers" },
];

export const CONTACTS_METRICS: V3Metric[] = [
  { label: "Total contacts", value: "1,284", detail: "9 active segments" },
  { label: "Suppressed", value: "109", detail: "Unsubscribed + bounce blocked" },
  { label: "Deliverable", value: "91.5%", detail: "After hygiene checks" },
  { label: "Role emails", value: "72", detail: "Manual review candidate" },
];

export const ONBOARDING_CHECKLIST: V3CheckItem[] = [
  {
    title: "Campaign types configured",
    subtitle: "Review request, product intro, event promotion",
    tone: "good",
    label: "Done",
  },
  {
    title: "Suppression seed imported",
    subtitle: "Unsubscribes and prior bounce addresses loaded",
    tone: "warning",
    label: "Review",
  },
  {
    title: "Safety policy acknowledged",
    subtitle: "Hard cap 200/day with pacing policy",
    tone: "good",
    label: "Done",
  },
  {
    title: "Send test to your own mailbox",
    subtitle: "Validate rendering and primary placement",
    tone: "danger",
    label: "Pending",
  },
];

export const IMMEDIATE_ACTIONS: V3CheckItem[] = [
  {
    title: "Warm-up guardrail",
    subtitle: "Keep this hour under 6 sends",
    tone: "warning",
    label: "Recommended",
  },
  {
    title: "Role email check",
    subtitle: "13 contacts flagged as info@ or office@",
    tone: "warning",
    label: "Review",
  },
  {
    title: "Variant rotation",
    subtitle: "Variant B has low usage in last 3 days",
    tone: "neutral",
    label: "Info",
  },
];
