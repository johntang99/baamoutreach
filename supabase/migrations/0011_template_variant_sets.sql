-- Template-level AI variant sets for campaigns.

create table if not exists public.template_variant_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  name text not null,
  language text not null default 'en' check (language in ('en', 'zh', 'es')),
  generation_notes jsonb not null default '{}'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, template_id, name)
);

create index if not exists idx_template_variant_sets_workspace
  on public.template_variant_sets(workspace_id);

create index if not exists idx_template_variant_sets_template
  on public.template_variant_sets(template_id);

alter table public.template_variant_sets enable row level security;

drop policy if exists "template_variant_sets_select_members" on public.template_variant_sets;
create policy "template_variant_sets_select_members"
on public.template_variant_sets
for select
to authenticated
using (
  workspace_id in (
    select workspace_id
    from public.workspace_memberships
    where user_id = (select auth.uid())
  )
);

drop policy if exists "template_variant_sets_insert_operators" on public.template_variant_sets;
create policy "template_variant_sets_insert_operators"
on public.template_variant_sets
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

drop policy if exists "template_variant_sets_update_operators" on public.template_variant_sets;
create policy "template_variant_sets_update_operators"
on public.template_variant_sets
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

drop policy if exists "template_variant_sets_delete_operators" on public.template_variant_sets;
create policy "template_variant_sets_delete_operators"
on public.template_variant_sets
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
  add column if not exists template_variant_set_id uuid references public.template_variant_sets(id) on delete set null;

create index if not exists idx_campaigns_template_variant_set
  on public.campaigns(template_variant_set_id);
