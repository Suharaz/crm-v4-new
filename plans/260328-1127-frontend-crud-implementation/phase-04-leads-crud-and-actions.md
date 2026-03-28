# Phase 04: Leads CRUD + Actions

## Priority: HIGH
## Status: Pending
## Blocked by: Phase 01

## Overview
Add create/edit/delete for leads + action buttons: assign, claim, transfer, convert, change status, manage labels.

## API Endpoints
- POST `/leads` — create (MANAGER+)
- PATCH `/leads/:id` — update
- DELETE `/leads/:id` — delete (SUPER_ADMIN)
- POST `/leads/:id/assign` — assign to user
- POST `/leads/:id/claim` — claim ownership
- POST `/leads/:id/transfer` — transfer (DEPARTMENT/FLOATING/UNASSIGN)
- POST `/leads/:id/status` — change status
- POST `/leads/:id/convert` — convert to customer
- POST `/leads/:id/labels` — attach labels
- DELETE `/leads/:id/labels/:labelId` — detach label
- POST `/leads/:id/activities` — add note

## Implementation

### List Page Enhancement
- Add "Tạo Lead" button (MANAGER+)
- Add action dropdown per row (edit, assign, transfer, delete)

### Pages
1. **app/(dashboard)/leads/new/page.tsx** — create lead form
2. **app/(dashboard)/leads/[id]/edit/page.tsx** — edit lead form

### Components
1. **components/leads/lead-form.tsx** — create/edit form
2. **components/leads/lead-actions.tsx** — action buttons on detail page
3. **components/leads/lead-assign-dialog.tsx** — assign to user dialog
4. **components/leads/lead-transfer-dialog.tsx** — transfer dialog
5. **components/leads/lead-status-dialog.tsx** — change status dialog
6. **components/leads/lead-label-manager.tsx** — attach/detach labels
7. **components/leads/lead-add-note-form.tsx** — add activity note

### Form Fields (CreateLeadDto)
- phone* (text, auto-normalized)
- name* (text)
- email (text)
- sourceId (select from lead sources)
- productId (select from products)

### Detail Page Actions Bar
- Assign (MANAGER+) → select user from dept
- Claim → one-click, confirm dialog
- Transfer → select: dept/floating/unassign
- Convert → confirm dialog (IN_PROGRESS → CONVERTED)
- Change Status → select new status
- Add Note → textarea + submit

## Success Criteria
- Create lead form with source/product dropdowns
- Edit lead info
- Delete with confirmation (SUPER_ADMIN)
- All action dialogs working
- Labels attach/detach
- Activity note creation
- Toast feedback on all actions
