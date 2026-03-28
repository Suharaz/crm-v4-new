# Phase 05: Customers CRUD + Actions

## Priority: MEDIUM
## Status: Pending
## Blocked by: Phase 01

## Overview
Add create/edit/delete for customers + claim, transfer, reactivate, label management.

## API Endpoints
- POST `/customers` — create (MANAGER+)
- PATCH `/customers/:id` — update
- DELETE `/customers/:id` — delete (SUPER_ADMIN)
- POST `/customers/:id/claim` — claim
- POST `/customers/:id/transfer` — transfer
- POST `/customers/:id/reactivate` — reactivate (MANAGER+)
- POST `/customers/:id/labels` — attach labels
- DELETE `/customers/:id/labels/:labelId` — detach

## Implementation

### Components (reuse patterns from leads)
1. **components/customers/customer-form.tsx** — create/edit
2. **components/customers/customer-actions.tsx** — action bar on detail page
3. **components/customers/customer-transfer-dialog.tsx** — transfer dialog
4. **components/customers/customer-label-manager.tsx** — labels

### Form Fields (CreateCustomerDto)
- phone* (text)
- name* (text)
- email (text)
- assignedUserId (select)
- assignedDepartmentId (select)

### Pages
1. **app/(dashboard)/customers/new/page.tsx**
2. **app/(dashboard)/customers/[id]/edit/page.tsx**

## Success Criteria
- Create/edit/delete customer
- Claim, transfer, reactivate actions
- Label management
