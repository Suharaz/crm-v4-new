# Phase 02: Settings CRUD — Departments, Levels, Sources, Labels, Payment Types

## Priority: HIGH
## Status: Pending
## Blocked by: Phase 01

## Overview
Convert read-only settings page into full CRUD with dialog-based create/edit/delete for all config entities.

## API Endpoints Used
- Departments: POST/PATCH/DELETE `/departments` (SUPER_ADMIN)
- Employee Levels: POST/PATCH/DELETE `/employee-levels` (SUPER_ADMIN)
- Lead Sources: POST/PATCH/DELETE `/lead-sources` (SUPER_ADMIN)
- Payment Types: POST/PATCH/DELETE `/payment-types` (SUPER_ADMIN)
- Labels: POST/PATCH `/labels` (MANAGER+)

## Implementation

### Settings Page Refactor
- Convert to client component with tabs (Phòng ban | Cấp bậc | Nguồn | Thanh toán | Nhãn)
- Each tab: list + "Thêm mới" button + edit/delete per row
- Role-based: only show add/edit/delete buttons for SUPER_ADMIN (MANAGER for labels)

### Components to Create
1. **components/settings/settings-page-client.tsx** — main client component with tabs
2. **components/settings/department-settings.tsx** — dept list + CRUD dialogs
3. **components/settings/employee-level-settings.tsx** — levels list + CRUD
4. **components/settings/lead-source-settings.tsx** — sources list + CRUD
5. **components/settings/payment-type-settings.tsx** — payment types list + CRUD
6. **components/settings/label-settings.tsx** — labels with color picker + CRUD

### Zod Schemas
```typescript
// Department: { name: string }
// EmployeeLevel: { name: string, rank: number }
// LeadSource: { name: string, description?: string }
// PaymentType: { name: string, description?: string }
// Label: { name: string, color: string, category?: string }
```

### Pattern (same for each entity)
1. Server page fetches data, passes to client component
2. Client component renders list with action buttons
3. Click "Thêm" → FormDialog with Zod schema
4. Click edit icon → FormDialog pre-filled
5. Click delete icon → ConfirmDialog → api.delete
6. On success → toast + router.refresh()

## Success Criteria
- All 5 setting types have working Create/Edit/Delete
- Role-based button visibility
- Toast on success/error
- Data refreshes after mutation
