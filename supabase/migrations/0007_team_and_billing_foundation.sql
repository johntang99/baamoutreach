-- BAAM Outreach - Team invites and billing foundation
-- Run this migration after 0006_fix_workspace_select_policy_for_bootstrap.sql

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_tier text not null default 'starter' check (plan_tier in ('starter', 'growth', 'scale')),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  seat_limit integer not null default 3 check (seat_limit > 0),
  campaign_daily_limit integer not null default 100 check (campaign_daily_limit > 0),
  hard_cap_limit integer not null default 200 check (hard_cap_limit > 0),
  current_period_end timestamptz,
  provider_customer_id text,
  provider_subscription_id text,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('operator', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_subscriptions_workspace on public.workspace_subscriptions(workspace_id);
create index if not exists idx_workspace_invitations_workspace on public.workspace_invitations(workspace_id);
create index if not exists idx_workspace_invitations_workspace_status on public.workspace_invitations(workspace_id, status);

create unique index if not exists idx_workspace_invitations_pending_email_unique
  on public.workspace_invitations(workspace_id, lower(email))
  where status = 'pending';

alter table public.workspace_subscriptions enable row level security;
alter table public.workspace_invitations enable row level security;

drop policy if exists "workspace_subscriptions_select_members" on public.workspace_subscriptions;
create policy "workspace_subscriptions_select_members"
on public.workspace_subscriptions
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "workspace_subscriptions_insert_owner" on public.workspace_subscriptions;
create policy "workspace_subscriptions_insert_owner"
on public.workspace_subscriptions
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);

drop policy if exists "workspace_subscriptions_update_owner" on public.workspace_subscriptions;
create policy "workspace_subscriptions_update_owner"
on public.workspace_subscriptions
for update
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
)
with check (
  updated_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);

drop policy if exists "workspace_invitations_select_members" on public.workspace_invitations;
create policy "workspace_invitations_select_members"
on public.workspace_invitations
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "workspace_invitations_insert_operators" on public.workspace_invitations;
create policy "workspace_invitations_insert_operators"
on public.workspace_invitations
for insert
to authenticated
with check (
  invited_by = (select auth.uid())
  and workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);

drop policy if exists "workspace_invitations_update_operators" on public.workspace_invitations;
create policy "workspace_invitations_update_operators"
on public.workspace_invitations
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

drop policy if exists "workspace_invitations_delete_operators" on public.workspace_invitations;
create policy "workspace_invitations_delete_operators"
on public.workspace_invitations
for delete
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
  )
);
