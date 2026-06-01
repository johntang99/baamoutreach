-- Lists expansion: Excel imports, language metadata, and AI variants.

alter table public.audience_lists
  add column if not exists default_language text,
  add column if not exists variants_template_id uuid references public.templates(id) on delete set null,
  add column if not exists template_variants jsonb,
  add column if not exists variants_generated_at timestamptz;

update public.audience_lists
set default_language = 'en'
where default_language is null;

alter table public.audience_lists
  alter column default_language set default 'en',
  alter column default_language set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audience_lists_default_language_check'
      and conrelid = 'public.audience_lists'::regclass
  ) then
    alter table public.audience_lists
      add constraint audience_lists_default_language_check
      check (default_language in ('en', 'zh', 'es'));
  end if;
end
$$;

alter table public.audience_list_entries
  add column if not exists language text;

update public.audience_list_entries
set language = 'en'
where language is null;

alter table public.audience_list_entries
  alter column language set default 'en',
  alter column language set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audience_list_entries_language_check'
      and conrelid = 'public.audience_list_entries'::regclass
  ) then
    alter table public.audience_list_entries
      add constraint audience_list_entries_language_check
      check (language in ('en', 'zh', 'es'));
  end if;
end
$$;

alter table public.campaign_recipients
  add column if not exists variant_index integer;

create index if not exists idx_audience_lists_variants_template
  on public.audience_lists(variants_template_id);
