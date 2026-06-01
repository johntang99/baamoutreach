-- BAAM Outreach - fix workspace select policy during bootstrap
-- Allow workspace creator to read their own workspace row before membership exists.

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
on public.workspaces
for select
to authenticated
using (
  created_by = (select auth.uid())
  or id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);
