-- BAAM Outreach - Lists MVP schema
-- Run this migration after 0007_team_and_billing_foundation.sql

create table if not exists public.audience_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  source_filename text,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  raw_row_count integer not null default 0,
  valid_row_count integer not null default 0,
  deduped_row_count integer not null default 0,
  suppressed_row_count integer not null default 0,
  ready_row_count integer not null default 0,
  processing_notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audience_list_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid not null references public.audience_lists(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  full_name text not null,
  company_name text,
  is_suppressed boolean not null default false,
  source_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (list_id, email)
);

create index if not exists idx_audience_lists_workspace on public.audience_lists(workspace_id);
create index if not exists idx_audience_lists_workspace_status on public.audience_lists(workspace_id, status);
create index if not exists idx_audience_list_entries_workspace on public.audience_list_entries(workspace_id);
create index if not exists idx_audience_list_entries_list on public.audience_list_entries(list_id);
create index if not exists idx_audience_list_entries_list_suppressed on public.audience_list_entries(list_id, is_suppressed);

alter table public.audience_lists enable row level security;
alter table public.audience_list_entries enable row level security;

drop policy if exists "audience_lists_select_members" on public.audience_lists;
create policy "audience_lists_select_members"
on public.audience_lists
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "audience_lists_insert_operators" on public.audience_lists;
create policy "audience_lists_insert_operators"
on public.audience_lists
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

drop policy if exists "audience_lists_update_operators" on public.audience_lists;
create policy "audience_lists_update_operators"
on public.audience_lists
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

drop policy if exists "audience_lists_delete_operators" on public.audience_lists;
create policy "audience_lists_delete_operators"
on public.audience_lists
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

drop policy if exists "audience_list_entries_select_members" on public.audience_list_entries;
create policy "audience_list_entries_select_members"
on public.audience_list_entries
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "audience_list_entries_insert_operators" on public.audience_list_entries;
create policy "audience_list_entries_insert_operators"
on public.audience_list_entries
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

drop policy if exists "audience_list_entries_update_operators" on public.audience_list_entries;
create policy "audience_list_entries_update_operators"
on public.audience_list_entries
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

drop policy if exists "audience_list_entries_delete_operators" on public.audience_list_entries;
create policy "audience_list_entries_delete_operators"
on public.audience_list_entries
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

alter table public.campaigns
  add column if not exists source_list_id uuid references public.audience_lists(id) on delete set null;

create index if not exists idx_campaigns_source_list on public.campaigns(source_list_id);
