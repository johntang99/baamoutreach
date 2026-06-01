# BAAM Outreach

Standalone codebase for BAAM Outreach, fully separated from BAAM Review.

## Local Development


kill -9 $(lsof -tiTCP:4010 -sTCP:LISTEN)
npm run dev


lsof -ti:4010 | xargs kill -9
rm -rf .next
npm run dev

npm install
npm run build

git add .
git commit -m "Update: describe your changes"
git push



App runs on [http://localhost:4010](http://localhost:4010).

## Supabase Setup (Phase 2)

1. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
2. In Supabase dashboard, run SQL from:
   - `supabase/migrations/0001_workspace_tenancy.sql`
   - `supabase/migrations/0002_single_send_mvp.sql`
   - `supabase/migrations/0003_bulk_campaign_mvp.sql`
   - `supabase/migrations/0004_policy_and_audit.sql`
   - `supabase/migrations/0005_fix_workspace_membership_policies.sql`
   - `supabase/migrations/0006_fix_workspace_select_policy_for_bootstrap.sql`
   - `supabase/migrations/0007_team_and_billing_foundation.sql`
   - `supabase/migrations/0008_lists_mvp.sql`
   - `supabase/migrations/0009_lists_excel_and_ai_variants.sql`
3. Add redirect URLs in Supabase Auth:
   - `http://localhost:4010/auth/callback`
   - your production callback URL when deploying
4. Optional AI variants setup:
   - `ANTHROPIC_API_KEY`
   - `AI_REWRITE_CLAUDE_MODEL` (optional override)

## Route Entry Points

- Landing page: `/`
- Product workspace shell: `/app`
- High-fidelity prototype: `/prototypes/outreach-saas-v3`
- Plan page: `/docs/implementation-plan`
- Workspace audit: `/app/audit`

## UI Architecture

Reusable UI is split into:

- `components/prototypes/outreach-v3`
- `components/product`

Detailed route inventory and roadmap:

- `docs/PAGE_INVENTORY.md`
- `docs/IMPLEMENTATION_PLAN.md`

## Separation Notes

This repo is designed to stay isolated from BAAM Review:

- Dedicated project folder: `baam-outreach`
- Dedicated local port: `4010`
- Independent `package.json` and lockfile
- Independent Git history

For infrastructure separation in production, use dedicated resources for this app:

- Separate Vercel project
- Separate Supabase project/database
- Separate Stripe account or product namespace
- Separate environment variables and secrets
