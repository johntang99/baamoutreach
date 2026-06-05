import { redirect } from "next/navigation";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/campaigns?campaignId=${id}`);
}
