-- BAAM Outreach - workspace tenancy baseline
-- Run this migration on the standalone baam-outreach Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists idx_workspace_memberships_user_workspace
  on public.workspace_memberships (user_id, workspace_id);

create index if not exists idx_workspace_memberships_workspace
  on public.workspace_memberships (workspace_id);

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
on public.workspaces
for select
to authenticated
using (
  id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "workspaces_insert_self_owner" on public.workspaces;
create policy "workspaces_insert_self_owner"
on public.workspaces
for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "workspaces_update_owner"
on public.workspaces
for update
to authenticated
using (
  id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
)
with check (
  id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);

drop policy if exists "workspace_memberships_select_scoped" on public.workspace_memberships;
create policy "workspace_memberships_select_scoped"
on public.workspace_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);

drop policy if exists "workspace_memberships_insert_self_bootstrap" on public.workspace_memberships;
create policy "workspace_memberships_insert_self_bootstrap"
on public.workspace_memberships
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and workspace_id in (
    select id
    from public.workspaces
    where created_by = (select auth.uid())
  )
);

drop policy if exists "workspace_memberships_insert_owner_manage" on public.workspace_memberships;
create policy "workspace_memberships_insert_owner_manage"
on public.workspace_memberships
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);

drop policy if exists "workspace_memberships_update_owner_manage" on public.workspace_memberships;
create policy "workspace_memberships_update_owner_manage"
on public.workspace_memberships
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
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);

drop policy if exists "workspace_memberships_delete_owner_manage" on public.workspace_memberships;
create policy "workspace_memberships_delete_owner_manage"
on public.workspace_memberships
for delete
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
      and role = 'owner'
  )
);
