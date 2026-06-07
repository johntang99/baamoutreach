-- BAAM Outreach - Prevent duplicate sender Gmail presets per workspace
-- Run this migration after 0012_workspace_multiple_senders.sql

do $$
begin
  if exists (
    select 1
    from (
      select
        workspace_id,
        lower(gmail_preset_email) as normalized_email,
        count(*) as duplicate_count
      from public.workspace_sender_settings
      where gmail_preset_email is not null
        and btrim(gmail_preset_email) <> ''
      group by workspace_id, lower(gmail_preset_email)
      having count(*) > 1
    ) duplicates
  ) then
    raise exception
      'Cannot create sender gmail preset unique index because duplicate values exist. Deduplicate public.workspace_sender_settings first.';
  end if;
end
$$;

create unique index if not exists idx_workspace_sender_settings_workspace_gmail_unique
  on public.workspace_sender_settings (workspace_id, lower(gmail_preset_email))
  where gmail_preset_email is not null
    and btrim(gmail_preset_email) <> '';
