-- BAAM Outreach - Multiple sender profiles per workspace
-- Run this migration after 0011_template_variant_sets.sql

alter table public.workspace_sender_settings
  drop constraint if exists workspace_sender_settings_workspace_id_key;

alter table public.workspace_sender_settings
  add column if not exists added_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_verified boolean not null default false;

update public.workspace_sender_settings
set added_by_user_id = coalesce(added_by_user_id, created_by)
where added_by_user_id is null;

create index if not exists idx_workspace_sender_settings_workspace_created
  on public.workspace_sender_settings(workspace_id, created_at desc);

drop policy if exists "workspace_sender_settings_delete_operators" on public.workspace_sender_settings;
create policy "workspace_sender_settings_delete_operators"
on public.workspace_sender_settings
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
