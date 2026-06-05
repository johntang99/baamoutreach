-- BAAM Outreach - Starter template library
-- Run this migration after 0009_lists_excel_and_ai_variants.sql

create table if not exists public.template_samples (
  id uuid primary key default gen_random_uuid(),
  sample_key text not null unique,
  name text not null,
  purpose text not null check (purpose in ('intro', 'review_request', 'follow_up', 'reengage', 'referral')),
  campaign_type text not null default 'general',
  language text not null default 'en',
  tone text not null default 'professional',
  subject_template text not null,
  body_template text not null,
  tags text[] not null default '{}',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_template_samples_lookup
  on public.template_samples (purpose, language, tone, sort_order);

alter table public.template_samples enable row level security;

drop policy if exists "template_samples_select_authenticated" on public.template_samples;
create policy "template_samples_select_authenticated"
on public.template_samples
for select
to authenticated
using (is_active = true);

insert into public.template_samples (
  sample_key,
  name,
  purpose,
  campaign_type,
  language,
  tone,
  subject_template,
  body_template,
  tags,
  sort_order
)
values
  (
    'intro_en_friendly',
    'Intro - friendly',
    'intro',
    'business_intro',
    'en',
    'friendly',
    '{first_name}, quick intro for {business_name}',
    'Hi {first_name},\n\nI am reaching out because we help local teams improve outreach and response quality.\n\nIf useful, I can share a short plan tailored for {business_name}.\n\nBest,\n{sender_name}',
    '{"intro","friendly","starter"}',
    10
  ),
  (
    'intro_en_professional',
    'Intro - professional',
    'intro',
    'business_intro',
    'en',
    'professional',
    '{first_name}, partnership idea for {business_name}',
    'Hello {first_name},\n\nI work with operators to improve campaign performance while staying compliant.\n\nWould you be open to a 10-minute walkthrough for {business_name}?\n\nRegards,\n{sender_name}',
    '{"intro","professional","starter"}',
    20
  ),
  (
    'review_en_friendly',
    'Review request - friendly',
    'review_request',
    'review_request',
    'en',
    'friendly',
    '{first_name}, quick favor for {business_name}',
    'Hi {first_name},\n\nThank you again for your support.\n\nIf your experience with {business_name} was positive, would you mind leaving a short review here: {review_link}\n\nWe appreciate it!',
    '{"review","friendly","starter"}',
    30
  ),
  (
    'review_en_professional',
    'Review request - professional',
    'review_request',
    'review_request',
    'en',
    'professional',
    '{first_name}, feedback request from {business_name}',
    'Hello {first_name},\n\nThank you for choosing {business_name}.\n\nWe would value your feedback. If convenient, please share a short review: {review_link}\n\nSincerely,\n{sender_name}',
    '{"review","professional","starter"}',
    40
  ),
  (
    'followup_en_short',
    'Follow-up - short',
    'follow_up',
    'follow_up',
    'en',
    'professional',
    '{first_name}, quick follow-up',
    'Hi {first_name},\n\nJust following up on my last message.\n\nIf this is relevant for {business_name}, I can send a concise next-step plan.\n\nThanks,\n{sender_name}',
    '{"follow_up","short","starter"}',
    50
  ),
  (
    'reengage_en_warm',
    'Re-engage - warm',
    'reengage',
    'reengage',
    'en',
    'friendly',
    '{first_name}, still open to revisit this?',
    'Hi {first_name},\n\nWanted to check in one more time in case timing is better now.\n\nHappy to share a refreshed plan for {business_name} if useful.\n\nBest,\n{sender_name}',
    '{"reengage","friendly","starter"}',
    60
  ),
  (
    'referral_en_polite',
    'Referral ask - polite',
    'referral',
    'referral',
    'en',
    'professional',
    '{first_name}, small referral request',
    'Hello {first_name},\n\nIf someone in your network could benefit from this service, would you be open to making an introduction?\n\nI would be grateful for any referral you can share.\n\nRegards,\n{sender_name}',
    '{"referral","professional","starter"}',
    70
  ),
  (
    'intro_zhcn_friendly',
    'Intro - friendly (zh-CN)',
    'intro',
    'business_intro',
    'zh-CN',
    'friendly',
    '{first_name}，给{business_name}的一个小建议',
    '你好 {first_name}，\n\n我们正在帮助本地商家优化外联质量与回复率。\n\n如果你愿意，我可以给 {business_name} 发一份简短建议。\n\n谢谢，\n{sender_name}',
    '{"intro","zh-CN","starter"}',
    80
  ),
  (
    'review_zhcn_polite',
    'Review request - polite (zh-CN)',
    'review_request',
    'review_request',
    'zh-CN',
    'professional',
    '{first_name}，想邀请你给{business_name}留个评价',
    '你好 {first_name}，\n\n感谢你一直以来的支持。\n\n如果方便的话，欢迎在这里留下简短评价：{review_link}\n\n非常感谢！',
    '{"review","zh-CN","starter"}',
    90
  ),
  (
    'followup_zhcn_short',
    'Follow-up - short (zh-CN)',
    'follow_up',
    'follow_up',
    'zh-CN',
    'professional',
    '{first_name}，再跟进一下',
    '你好 {first_name}，\n\n我再跟进一下上一封邮件。\n\n如果对 {business_name} 有帮助，我可以发你一版简要执行建议。\n\n谢谢，\n{sender_name}',
    '{"follow_up","zh-CN","starter"}',
    100
  ),
  (
    'intro_zhtw_friendly',
    'Intro - friendly (zh-TW)',
    'intro',
    'business_intro',
    'zh-TW',
    'friendly',
    '{first_name}，給{business_name}的一個小提案',
    '嗨 {first_name}，\n\n我們正在協助在地團隊優化外聯成效與回覆率。\n\n如果你有興趣，我可以分享一份針對 {business_name} 的簡短建議。\n\n謝謝，\n{sender_name}',
    '{"intro","zh-TW","starter"}',
    110
  ),
  (
    'review_zhtw_polite',
    'Review request - polite (zh-TW)',
    'review_request',
    'review_request',
    'zh-TW',
    'professional',
    '{first_name}，想邀請你給{business_name}一則評價',
    '嗨 {first_name}，\n\n感謝你對 {business_name} 的支持。\n\n若方便，歡迎在這裡留下簡短評價：{review_link}\n\n非常感謝！',
    '{"review","zh-TW","starter"}',
    120
  ),
  (
    'followup_zhtw_short',
    'Follow-up - short (zh-TW)',
    'follow_up',
    'follow_up',
    'zh-TW',
    'professional',
    '{first_name}，補充跟進一下',
    '嗨 {first_name}，\n\n這邊補充跟進上一封訊息。\n\n如果你願意，我可以提供一份適合 {business_name} 的短版建議。\n\n謝謝，\n{sender_name}',
    '{"follow_up","zh-TW","starter"}',
    130
  ),
  (
    'reengage_zhcn_warm',
    'Re-engage - warm (zh-CN)',
    'reengage',
    'reengage',
    'zh-CN',
    'friendly',
    '{first_name}，现在方便再聊聊吗？',
    '你好 {first_name}，\n\n想再跟进一次，看看现在是否是更合适的时间。\n\n如果你愿意，我可以更新一版适合 {business_name} 的方案。\n\n祝好，\n{sender_name}',
    '{"reengage","zh-CN","starter"}',
    140
  ),
  (
    'referral_zhtw_polite',
    'Referral ask - polite (zh-TW)',
    'referral',
    'referral',
    'zh-TW',
    'professional',
    '{first_name}，想請你幫忙引薦',
    '嗨 {first_name}，\n\n若你身邊有適合這項服務的朋友，想請你協助引薦。\n\n任何介紹都非常感謝。\n\n謝謝，\n{sender_name}',
    '{"referral","zh-TW","starter"}',
    150
  )
on conflict (sample_key) do update
set
  name = excluded.name,
  purpose = excluded.purpose,
  campaign_type = excluded.campaign_type,
  language = excluded.language,
  tone = excluded.tone,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  tags = excluded.tags,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
