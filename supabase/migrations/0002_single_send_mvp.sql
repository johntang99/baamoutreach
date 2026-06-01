-- BAAM Outreach - Single Send MVP schema
-- Run this migration after 0001_workspace_tenancy.sql

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  email text not null,
  company_name text,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  campaign_type text not null default 'general',
  subject_template text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  reason text,
  source text not null default 'manual',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.send_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  template_id uuid references public.templates(id) on delete set null,
  channel text not null default 'gmail_manual',
  status text not null default 'draft_prepared',
  subject text not null,
  body text not null,
  gmail_compose_url text not null,
  risk_level text not null default 'low',
  risk_notes text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.send_request_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  send_request_id uuid not null references public.send_requests(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_workspace on public.contacts(workspace_id);
create index if not exists idx_templates_workspace on public.templates(workspace_id);
create index if not exists idx_suppression_workspace on public.suppression_entries(workspace_id);
create index if not exists idx_send_requests_workspace on public.send_requests(workspace_id);
create index if not exists idx_send_request_events_workspace on public.send_request_events(workspace_id);
create index if not exists idx_send_request_events_request on public.send_request_events(send_request_id);

alter table public.contacts enable row level security;
alter table public.templates enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.send_requests enable row level security;
alter table public.send_request_events enable row level security;

-- Contacts policies
drop policy if exists "contacts_select_members" on public.contacts;
create policy "contacts_select_members"
on public.contacts
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "contacts_insert_operators" on public.contacts;
create policy "contacts_insert_operators"
on public.contacts
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

drop policy if exists "contacts_update_operators" on public.contacts;
create policy "contacts_update_operators"
on public.contacts
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

drop policy if exists "contacts_delete_operators" on public.contacts;
create policy "contacts_delete_operators"
on public.contacts
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

-- Templates policies
drop policy if exists "templates_select_members" on public.templates;
create policy "templates_select_members"
on public.templates
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "templates_insert_operators" on public.templates;
create policy "templates_insert_operators"
on public.templates
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

drop policy if exists "templates_update_operators" on public.templates;
create policy "templates_update_operators"
on public.templates
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

drop policy if exists "templates_delete_operators" on public.templates;
create policy "templates_delete_operators"
on public.templates
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

-- Suppression policies
drop policy if exists "suppression_select_members" on public.suppression_entries;
create policy "suppression_select_members"
on public.suppression_entries
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "suppression_insert_operators" on public.suppression_entries;
create policy "suppression_insert_operators"
on public.suppression_entries
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

drop policy if exists "suppression_delete_operators" on public.suppression_entries;
create policy "suppression_delete_operators"
on public.suppression_entries
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

-- Send requests policies
drop policy if exists "send_requests_select_members" on public.send_requests;
create policy "send_requests_select_members"
on public.send_requests
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "send_requests_insert_operators" on public.send_requests;
create policy "send_requests_insert_operators"
on public.send_requests
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

-- Send request events policies
drop policy if exists "send_request_events_select_members" on public.send_request_events;
create policy "send_request_events_select_members"
on public.send_request_events
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "send_request_events_insert_operators" on public.send_request_events;
create policy "send_request_events_insert_operators"
on public.send_request_events
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
