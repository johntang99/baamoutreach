-- BAAM Outreach - fix recursive RLS policies on workspace_memberships
-- This resolves: 42P17 infinite recursion detected in policy for relation "workspace_memberships"
-- Run this migration after 0001..0004 if you already applied them.

alter table public.workspace_memberships enable row level security;

drop policy if exists "workspace_memberships_select_scoped" on public.workspace_memberships;
create policy "workspace_memberships_select_scoped"
on public.workspace_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
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
    select id
    from public.workspaces
    where created_by = (select auth.uid())
  )
);

drop policy if exists "workspace_memberships_update_owner_manage" on public.workspace_memberships;
create policy "workspace_memberships_update_owner_manage"
on public.workspace_memberships
for update
to authenticated
using (
  workspace_id in (
    select id
    from public.workspaces
    where created_by = (select auth.uid())
  )
)
with check (
  workspace_id in (
    select id
    from public.workspaces
    where created_by = (select auth.uid())
  )
);

drop policy if exists "workspace_memberships_delete_owner_manage" on public.workspace_memberships;
create policy "workspace_memberships_delete_owner_manage"
on public.workspace_memberships
for delete
to authenticated
using (
  workspace_id in (
    select id
    from public.workspaces
    where created_by = (select auth.uid())
  )
);
