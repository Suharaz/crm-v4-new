## Phase Implementation Report

### Executed Phase
- Phase: zod-form-validation (ad-hoc task)
- Plan: none
- Status: completed

### Files Modified

| File | Change |
|------|--------|
| `apps/web/src/lib/zod-form-validation-schemas.ts` | Created — all Zod schemas + `parseZodErrors` helper |
| `apps/web/src/components/leads/lead-form.tsx` | Import schema, validate on submit, show field errors |
| `apps/web/src/components/customers/customer-form.tsx` | Import schema, validate on submit, show field errors |
| `apps/web/src/components/users/user-form.tsx` | Import schemas (create/edit), validate on submit, show field errors |
| `apps/web/src/components/products/product-list-client.tsx` | Import schema, validate on submit, show field errors, clear on open |
| `apps/web/src/components/orders/create-order-dialog.tsx` | Import schema, validate on submit, show amount error |
| `apps/web/src/components/tasks/tasks-management-list-with-create-dialog.tsx` | Import schema, replaced manual title check with Zod, show title/dueDate errors |
| `apps/web/src/components/settings/settings-crud-list.tsx` | Import name schema, validate required name field, show inline error |

### Schemas Created (`zod-form-validation-schemas.ts`)
- `leadSchema` — phone (VN regex), name (2-100 chars), email (optional valid)
- `customerSchema` — phone (VN, required), name (required), email (optional)
- `userCreateSchema` — email (required valid), password (min 8), name, phone (optional VN), role
- `userEditSchema` — extends create with password optional
- `productSchema` — name (required), price (> 0)
- `orderSchema` — customerId (required), amount (> 0)
- `taskSchema` — title (required), dueDate/remindAt (optional valid date)
- `settingsNameSchema` — name (required)
- `parseZodErrors()` — flattens ZodError to `Record<string, string>`

### Approach
- Validate on submit only (not per-keystroke, per spec)
- Clear field error on next change to that field
- Reset `fieldErrors` when opening a dialog
- `FormField` component already had `error` prop — used directly
- For task/settings dialogs using raw `<label>` elements, added `<p className="text-xs text-red-500">` inline
- All messages in Vietnamese

### Tests Status
- Type check: pass (fixed `symbol` index type issue in `parseZodErrors`)
- Build: pass — `3 successful, 3 total`
- Unit tests: not run (no existing test suite for frontend components)

### Issues Encountered
- Zod v4 `issue.path[0]` is typed `string | number | symbol`; `symbol` cannot index an object. Fixed by converting to `String(rawKey)` after null-check.

### Next Steps
- Task #6 can be marked completed
- Task #8 (mobile responsive + loading skeletons) is next pending item
