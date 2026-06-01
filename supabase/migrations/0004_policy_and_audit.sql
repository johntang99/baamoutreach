-- BAAM Outreach - Policy configuration and audit trail
-- Run this migration after 0003_bulk_campaign_mvp.sql

create table if not exists public.workspace_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  recommended_daily_cap integer not null default 100 check (recommended_daily_cap > 0),
  hard_daily_cap integer not null default 200 check (hard_daily_cap > 0),
  min_interval_seconds integer not null default 120 check (min_interval_seconds > 0),
  max_interval_seconds integer not null default 180 check (max_interval_seconds > 0),
  allow_role_based_recipients boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_sender_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  send_from_name text,
  reply_to_email text,
  gmail_preset_email text,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_policies_workspace on public.workspace_policies(workspace_id);
create index if not exists idx_workspace_sender_settings_workspace on public.workspace_sender_settings(workspace_id);
create index if not exists idx_workspace_audit_logs_workspace on public.workspace_audit_logs(workspace_id);
create index if not exists idx_workspace_audit_logs_workspace_created on public.workspace_audit_logs(workspace_id, created_at desc);

alter table public.workspace_policies enable row level security;
alter table public.workspace_sender_settings enable row level security;
alter table public.workspace_audit_logs enable row level security;

drop policy if exists "workspace_policies_select_members" on public.workspace_policies;
create policy "workspace_policies_select_members"
on public.workspace_policies
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "workspace_policies_insert_operators" on public.workspace_policies;
create policy "workspace_policies_insert_operators"
on public.workspace_policies
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "workspace_policies_update_operators" on public.workspace_policies;
create policy "workspace_policies_update_operators"
on public.workspace_policies
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
  updated_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "workspace_sender_settings_select_members" on public.workspace_sender_settings;
create policy "workspace_sender_settings_select_members"
on public.workspace_sender_settings
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "workspace_sender_settings_insert_operators" on public.workspace_sender_settings;
create policy "workspace_sender_settings_insert_operators"
on public.workspace_sender_settings
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "workspace_sender_settings_update_operators" on public.workspace_sender_settings;
create policy "workspace_sender_settings_update_operators"
on public.workspace_sender_settings
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
  updated_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "workspace_audit_logs_select_members" on public.workspace_audit_logs;
create policy "workspace_audit_logs_select_members"
on public.workspace_audit_logs
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "workspace_audit_logs_insert_operators" on public.workspace_audit_logs;
create policy "workspace_audit_logs_insert_operators"
on public.workspace_audit_logs
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
