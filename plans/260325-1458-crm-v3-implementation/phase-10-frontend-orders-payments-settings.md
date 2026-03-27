---
phase: 10
title: "Frontend Orders, Payments & Settings"
status: pending
priority: P1
effort: 10h
depends_on: [5, 8]
---

# Phase 10: Frontend Orders, Payments & Settings

## Context Links

- Order/Payment models: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 129-158)
- Settings scope: super_admin config for lookup tables + user management

## Overview

Build order management pages, payment recording + verification UI, and settings panels for super_admin (users, departments, employee levels, lead sources, payment types, labels, products).

## Requirements

### Functional
- Order list: data table with filters (status, customer, product, date, created_by)
- Order detail: info, linked lead/customer, payments, status history
- Create order: linked to lead/customer, select product, enter amount
- Payment create: select payment type, enter amount, notes
- Payment verify/reject: manager+ action with confirmation dialog
- Settings pages: CRUD for users, departments, employee levels, lead sources, payment types, labels, products
- Settings role guard: settings only visible/accessible to manager+ (super_admin for most, manager for labels)

### Non-Functional
- Payment verification shows conversion warning (will convert lead)
- Settings use sheet/dialog for create/edit (no separate pages)

## Architecture

### File Structure
```
apps/web/src/app/(dashboard)/
├── orders/
│   ├── page.tsx                    # Order list
│   ├── [id]/
│   │   └── page.tsx                # Order detail
│   └── new/
│       └── page.tsx                # Create order
├── settings/
│   ├── page.tsx                    # Settings overview / redirect
│   ├── users/
│   │   └── page.tsx                # User management
│   ├── departments/
│   │   └── page.tsx                # Department management
│   ├── employee-levels/
│   │   └── page.tsx
│   ├── lead-sources/
│   │   └── page.tsx
│   ├── payment-types/
│   │   └── page.tsx
│   ├── labels/
│   │   └── page.tsx
│   ├── products/
│   │   └── page.tsx
│   ├── product-categories/
│   │   └── page.tsx
│   ├── teams/
│   │   └── page.tsx
│   ├── api-keys/
│   │   └── page.tsx
│   ├── assignment-templates/
│   │   └── page.tsx
│   ├── recall-config/
│   │   └── page.tsx
│   └── layout.tsx                  # Settings sidebar nav

apps/web/src/components/
├── orders/
│   ├── order-table.tsx
│   ├── order-detail-panel.tsx
│   ├── order-form.tsx
│   ├── order-status-badge.tsx
│   └── order-status-select.tsx
├── payments/
│   ├── payment-list.tsx            # Payments for an order
│   ├── payment-form.tsx
│   ├── payment-verify-dialog.tsx
│   └── payment-status-badge.tsx
├── settings/
│   ├── settings-nav.tsx            # Settings sidebar
│   ├── user-form.tsx
│   ├── department-form.tsx
│   ├── employee-level-form.tsx
│   ├── lead-source-form.tsx
│   ├── payment-type-form.tsx
│   ├── label-form.tsx
│   └── product-form.tsx
```

### Payment Verify Flow (UI)
```
Manager clicks "Verify" on payment
  → Confirmation dialog: "This will mark the lead as converted. Continue?"
  → API call POST /payments/:id/verify
  → Success: payment badge → VERIFIED, lead status → CONVERTED
  → Toast: "Payment verified. Lead converted to customer."
```

## Related Code Files

### Create
- All files listed in Architecture section
- `apps/web/src/lib/order-api.ts`
- `apps/web/src/lib/payment-api.ts`
- `apps/web/src/lib/settings-api.ts`

### Modify
- `apps/web/src/components/layout/app-sidebar.tsx` — settings sub-nav

## Implementation Steps

1. **Build order list page**
   - Reuse data-table component from phase 09
   - Columns: order ID, customer, product, amount, status, created by, date
   - Filters: status, customer (search), product, date range

2. **Build order detail page**
   - Info panel: amount, product, status badge, linked lead + customer (clickable)
   - Payments section: list payments with status badges
   - Create payment button
   - Status update dropdown (manager+)

3. **Build order create form**
   - Select lead/customer (searchable select)
   - Select product (dropdown)
   - Amount (auto-filled from product price, editable)
   - Notes textarea
   - Validation: lead must be assigned to current user (or manager+)

4. **Build payment components**
   - `payment-form.tsx`: payment type select, amount, notes
   - `payment-list.tsx`: table of payments for an order
   - `payment-verify-dialog.tsx`: confirm dialog with conversion warning
   - `payment-status-badge.tsx`: color-coded (pending=yellow, verified=green, rejected=red)

5. **Build settings layout**
   - `settings/layout.tsx`: secondary sidebar with settings nav items
   - Guard: redirect non-manager users to dashboard

6. **Build settings CRUD pages**
   - Each settings page follows same pattern:
     - Data table listing items
     - "Add" button → opens sheet/dialog with form
     - Row actions: edit (sheet), deactivate/delete (confirm dialog)
   - **Users**: table + create form (email, name, role, department, team, level). For managers: managed departments multi-select
   - **Teams**: name, department (select), leader (select from dept users). Members list
   - **Departments**: name, description
   - **Employee Levels**: name, rank (numeric)
   - **Lead Sources**: name, description, active toggle
   - **Payment Types**: name, description, active toggle
   - **Labels**: name, color picker, category, active toggle
   - **Products**: name, price, category (select), description, status toggle
   - **Product Categories**: name, description, active toggle
   - **API Keys**: list with prefix + last used + created by. Create button shows key ONCE. Revoke/deactivate actions. Permissions multi-select. Expiration date picker.
   - **Assignment Templates**: name, strategy (ROUND_ROBIN/AI_WEIGHTED), member list (multi-select users). "Apply" button opens lead selector
   - **Recall Config**: entity type (Lead/Customer), max days in pool (number input), auto labels (multi-select). Super admin only

7. **Role-based access in settings**
   - Super admin: access all settings
   - Manager: access labels, view users in department
   - User: no settings access (middleware redirect)

## Todo List

- [ ] Build order list page with data table
- [ ] Build order detail page
- [ ] Build order create form
- [ ] Build payment form component
- [ ] Build payment list component
- [ ] Build payment verify/reject dialogs
- [ ] Build settings layout with secondary nav
- [ ] Build user management page (super_admin)
- [ ] Build department management page (super_admin)
- [ ] Build employee levels page (super_admin)
- [ ] Build lead sources page (super_admin)
- [ ] Build payment types page (super_admin)
- [ ] Build labels management page (manager+)
- [ ] Build products management page (manager+)
- [ ] Build product categories management page (manager+)
- [ ] Build teams management page (super_admin)
- [ ] Build API keys management page (super_admin) — show key ONCE on create
- [ ] Build manager-department assignment in user edit form (super_admin)
- [ ] Build assignment templates page (manager+): create, edit, member selection, apply
- [ ] Build recall config page (super_admin): entity type, days, auto labels
- [ ] Implement role-based settings access
- [ ] Test payment verify → conversion flow in UI
- [ ] Test all CRUD operations in settings

## Success Criteria

- Order list with filters and pagination
- Order detail shows linked lead/customer/payments
- Payment verification triggers lead conversion with confirmation
- All settings CRUD pages functional (create, edit, deactivate)
- Settings only accessible to manager+ (super_admin for most)
- Forms validate input with Zod
- Responsive layout for all pages

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Settings page count (7 pages) | Medium | Reuse generic CRUD pattern, extract shared form wrapper |
| Payment verify race condition UI | Low | Disable button during request, show toast on conflict |
| Amount precision display | Low | Format with toLocaleString or Intl.NumberFormat |
