import type { Metadata } from "next";
import { OutreachV3App } from "@/components/prototypes/outreach-v3/outreach-v3-app";

export const metadata: Metadata = {
  title: "BAAM Outreach Prototype V3",
  description:
    "Stripe-inspired outreach SaaS prototype split into reusable Next.js + Tailwind components.",
};

export default function OutreachSaasV3Page() {
  return <OutreachV3App />;
}
