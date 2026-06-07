-- BAAM Outreach - Persist selected sender per campaign
-- Run this migration after 0013_sender_unique_gmail_preset_per_workspace.sql

alter table public.campaigns
  add column if not exists sender_setting_id uuid
    references public.workspace_sender_settings(id) on delete restrict;

create index if not exists idx_campaigns_sender_setting
  on public.campaigns(sender_setting_id);

update public.campaigns as c
set sender_setting_id = (
  select s.id
  from public.workspace_sender_settings as s
  where s.workspace_id = c.workspace_id
  order by s.created_at asc
  limit 1
)
where c.sender_setting_id is null;
