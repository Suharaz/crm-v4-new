# Frontend CRUD Implementation Plan

## Problem
Backend API has 140+ endpoints with full CRUD. Frontend is purely read-only — no create/edit/delete forms exist. Super admin logs in and can only view data, zero interaction.

## Solution
Add CRUD UI for all major entities using existing patterns: shadcn/ui + React Hook Form + Zod + api-client.ts.

## Architecture Decisions
- **Dialog-based forms** for simple entities (settings, labels). No separate pages.
- **Page-based forms** for complex entities (leads, customers, orders) with dedicated `/new` and `/[id]/edit` routes.
- **Client Components** for all forms (need interactivity). Server Components remain for list/detail pages.
- **Reusable form pattern**: Zod schema → RHF → api.post/patch → router.refresh() → toast
- **Action buttons** on detail pages (assign, transfer, convert, etc.) via small dialog forms.

## Dependencies
- react-hook-form 7.72 ✓ (installed)
- @hookform/resolvers 5.2 ✓ (installed)
- zod 4.3 ✓ (installed)
- Need: shadcn Dialog, Select, Textarea, Toast, DropdownMenu, Badge, Tabs, AlertDialog

## Phases

| # | Phase | Status | Key Files |
|---|-------|--------|-----------|
| 1 | Shared UI + Form Infrastructure | pending | components/ui/, hooks/, lib/ |
| 2 | Settings CRUD | pending | settings/page, components/settings/ |
| 3 | Users Management | pending | users/page, components/users/ |
| 4 | Leads CRUD + Actions | pending | leads/, components/leads/ |
| 5 | Customers CRUD + Actions | pending | customers/, components/customers/ |
| 6 | Products CRUD | pending | products/, components/products/ |
| 7 | Orders + Payments | pending | orders/, components/orders/ |

## Commit Strategy
One commit per completed phase.
