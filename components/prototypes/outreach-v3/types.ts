export type V3ScreenId =
  | "onboarding"
  | "dashboard"
  | "single-send"
  | "bulk-send"
  | "templates"
  | "contacts"
  | "team-billing";

export interface V3NavItem {
  id: V3ScreenId;
  label: string;
  shortLabel?: string;
  count?: number;
}

export type StatusTone = "good" | "warning" | "danger" | "neutral";

export interface V3Metric {
  label: string;
  value: string;
  detail: string;
}

export interface V3CheckItem {
  title: string;
  subtitle: string;
  tone: StatusTone;
  label: string;
}
