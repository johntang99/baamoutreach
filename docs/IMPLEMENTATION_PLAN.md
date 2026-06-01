# BAAM Outreach Implementation Plan

## Goal

Build BAAM Outreach as a fully standalone SaaS product, separate from BAAM Review in codebase and infrastructure.

## Product Scope (MVP)

- Authentication and workspace onboarding
- Single-send workflow (Send in Gmail first)
- Bulk campaign builder with pacing and safety controls
- Contacts, lists, and suppression pipeline
- Template management
- Team roles and billing foundation
- Docs/help and legal baseline

## Phases

### Phase 0 - Separation Foundation (completed)

- Standalone repository and application scaffold
- Independent package and lockfile
- Dedicated runtime port
- Initial design system and prototype baseline

### Phase 1 - Product Skeleton and Navigation (completed)

- Route map and navigation shell for all core pages
- Low-fidelity implementation of all major pages and states
- Shared page primitives and reusable component patterns

### Phase 2 - Authentication and Tenancy (completed)

- Signup, login, password reset flows with backend integration
- Workspace model and tenant isolation
- Protected routes and session middleware

### Phase 3 - Single Send MVP (completed)

- Recipient selector and template merge
- Pre-send policy validation
- Send in Gmail execution pipeline
- Basic event logging

### Phase 4 - Bulk Campaign MVP (completed)

- CSV import, validation, and dedupe
- Excel import support, sample file download, and list send guidance
- AI content variation for list-based campaign sends
- Queue generation and release controls
- Pacing and cap enforcement
- Campaign detail reporting

### Phase 5 - Data, Policy, and Compliance (completed)

- Suppression and unsubscribe enforcement
- Policy configuration and audit trails
- Safety monitoring and alerting thresholds

### Phase 6 - Team and Billing (in progress)

- Member roles and seat management
- Plan-based entitlements
- Subscription and invoice operations

### Phase 7 - Hardening and Launch

- QA and reliability pass
- Performance and observability baseline
- Security review and release checklist

## Definition of Done (MVP)

- Core send workflows function end-to-end
- Suppression and policy checks are enforced server-side
- Workspace and member access boundaries are correct
- Billing and entitlement gates are active
- Key pages and docs are production-ready
