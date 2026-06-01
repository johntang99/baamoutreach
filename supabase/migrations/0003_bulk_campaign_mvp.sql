-- BAAM Outreach - Bulk Campaign MVP schema
-- Run this migration after 0002_single_send_mvp.sql

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  template_id uuid not null references public.templates(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'ready', 'active', 'paused', 'completed')),
  daily_cap integer not null default 100 check (daily_cap > 0),
  hard_cap integer not null default 200 check (hard_cap > 0),
  min_interval_seconds integer not null default 120 check (min_interval_seconds > 0),
  max_interval_seconds integer not null default 180 check (max_interval_seconds > 0),
  total_contacts integer not null default 0,
  queued_count integer not null default 0,
  skipped_count integer not null default 0,
  opened_count integer not null default 0,
  sent_count integer not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  full_name text not null,
  email text not null,
  company_name text,
  status text not null default 'queued' check (status in ('queued', 'skipped_suppressed', 'skipped_role', 'opened_gmail', 'sent', 'failed')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  risk_notes text[] not null default '{}',
  subject text not null,
  body text not null,
  gmail_compose_url text not null,
  scheduled_at timestamptz,
  opened_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_workspace on public.campaigns(workspace_id);
create index if not exists idx_campaigns_workspace_status on public.campaigns(workspace_id, status);
create index if not exists idx_campaign_recipients_workspace on public.campaign_recipients(workspace_id);
create index if not exists idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id);
create index if not exists idx_campaign_recipients_campaign_status on public.campaign_recipients(campaign_id, status);
create index if not exists idx_campaign_events_workspace on public.campaign_events(workspace_id);
create index if not exists idx_campaign_events_campaign on public.campaign_events(campaign_id);

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_events enable row level security;

drop policy if exists "campaigns_select_members" on public.campaigns;
create policy "campaigns_select_members"
on public.campaigns
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "campaigns_insert_operators" on public.campaigns;
create policy "campaigns_insert_operators"
on public.campaigns
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "campaigns_update_operators" on public.campaigns;
create policy "campaigns_update_operators"
on public.campaigns
for update
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
)
with check (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "campaign_recipients_select_members" on public.campaign_recipients;
create policy "campaign_recipients_select_members"
on public.campaign_recipients
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "campaign_recipients_insert_operators" on public.campaign_recipients;
create policy "campaign_recipients_insert_operators"
on public.campaign_recipients
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "campaign_recipients_update_operators" on public.campaign_recipients;
create policy "campaign_recipients_update_operators"
on public.campaign_recipients
for update
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
)
with check (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "campaign_events_select_members" on public.campaign_events;
create policy "campaign_events_select_members"
on public.campaign_events
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "campaign_events_insert_operators" on public.campaign_events;
create policy "campaign_events_insert_operators"
on public.campaign_events
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);
