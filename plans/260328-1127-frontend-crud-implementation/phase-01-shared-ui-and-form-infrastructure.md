# Phase 01: Shared UI Components & Form Infrastructure

## Priority: CRITICAL (blocks all other phases)
## Status: Pending

## Overview
Install missing shadcn/ui components and create reusable form patterns needed by all CRUD phases.

## Requirements

### shadcn/ui Components to Add
- **Dialog** — modal forms for settings CRUD
- **Select** — dropdowns for department, status, role, etc.
- **Textarea** — notes, descriptions
- **Toast/Sonner** — success/error notifications after CRUD ops
- **DropdownMenu** — action menus on table rows
- **AlertDialog** — delete confirmations
- **Badge** — improved status/label display
- **Tabs** — settings page sections
- **Separator** — form sections
- **Form** — shadcn form wrapper (RHF integration)

### Shared Form Infrastructure
1. **hooks/use-form-action.ts** — custom hook wrapping RHF + api calls + toast + router.refresh
2. **components/shared/form-dialog.tsx** — reusable dialog with form, loading state, error display
3. **components/shared/confirm-dialog.tsx** — reusable delete/action confirmation
4. **components/shared/form-field-wrapper.tsx** — label + error message wrapper

### API Client Enhancement
- Add error handling that extracts validation errors from NestJS response format

## Implementation Steps

1. Install shadcn components: `npx shadcn@latest add dialog select textarea sonner dropdown-menu alert-dialog badge tabs separator`
2. Add shadcn Form component (RHF integration): `npx shadcn@latest add form`
3. Create `hooks/use-form-action.ts`
4. Create `components/shared/form-dialog.tsx`
5. Create `components/shared/confirm-dialog.tsx`
6. Add Toaster to root layout
7. Compile check

## Success Criteria
- All shadcn components installed and importable
- Form dialog opens/closes, submits, shows loading, shows errors
- Confirm dialog works with async action
- Toast notifications appear on success/error
- Build passes
