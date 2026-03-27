---
phase: 9
title: "Frontend Leads & Customers Pages"
status: pending
priority: P1
effort: 14h
depends_on: [4, 8]
---

# Phase 09: Frontend Leads & Customers Pages

## Context Links

- UI/UX patterns: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 159-198)
- TanStack Table: synthesis (line 22)
- Kanban: synthesis (line 183)
- Pool view: synthesis (line 194)

## Overview

Build lead and customer list pages (TanStack Table with filters, search, pagination), detail pages (info + timeline + labels), lead pool view, kanban board for lead pipeline, lead assignment UI, claim button for customers.

## Requirements

### Functional
- Lead list: data table with columns (name, phone, status, source, assigned user, created date)
- Lead filters: status, source, assigned user, department, date range, search
- Lead detail: info panel, activity timeline, labels, assigned user, conversion button
- Lead pool: dedicated view of unassigned leads, bulk assign
- Lead kanban: drag-drop pipeline view (pool → assigned → in_progress → converted/lost)
- Customer list: data table with columns (name, phone, email, assigned user, labels)
- Customer detail: info panel, leads history, orders, activity timeline, labels
- Claim button: prominent CTA on unclaimed customer in user's department
- Quick actions: assign, change status, add note, add label

### Non-Functional
- URL-based filter state (shareable filtered views)
- Optimistic updates for assign/claim/status change
- Debounced search (300ms)
- Infinite scroll or "load more" for timeline

## Architecture

### File Structure
```
apps/web/src/app/(dashboard)/
├── leads/
│   ├── page.tsx                    # Lead list (Server Component → fetch data)
│   ├── pool/
│   │   ├── new/
│   │   │   └── page.tsx            # Kho Mới — manager+ only (POOL, dept=null)
│   │   └── department/
│   │       └── page.tsx            # Kho Phòng Ban — NV dept thấy (POOL, dept=X)
│   ├── kanban/
│   │   └── page.tsx                # Kanban pipeline
│   ├── [id]/
│   │   └── page.tsx                # Lead detail
│   └── new/
│       └── page.tsx                # Create lead form
├── floating/
│   └── page.tsx                    # Kho Thả Nổi — ALL users (leads + customers FLOATING)
├── customers/
│   ├── page.tsx                    # Customer SEARCH page (search by phone, includes INACTIVE)
│   └── [id]/
│       └── page.tsx                # Customer detail (info + leads + orders + payments + timeline + docs)

apps/web/src/components/
├── leads/
│   ├── lead-table.tsx              # TanStack Table wrapper (Client)
│   ├── lead-filters.tsx            # Filter sidebar/bar (Client)
│   ├── lead-form.tsx               # Create/edit form (Client)
│   ├── lead-detail-panel.tsx       # Info display
│   ├── lead-status-badge.tsx       # Color-coded status
│   ├── lead-assign-dialog.tsx      # Assignment modal
│   ├── lead-kanban-board.tsx       # Kanban with dnd-kit (Client)
│   └── lead-kanban-card.tsx        # Kanban card
├── customers/
│   ├── customer-search-form.tsx       # Phone search input + results
│   ├── customer-search-result.tsx     # Single result card after search
│   ├── customer-detail-panel.tsx      # Info display
│   ├── customer-edit-form.tsx         # Edit form (phone field disabled for non-manager)
│   ├── customer-claim-button.tsx      # Prominent claim CTA
│   └── customer-note-form.tsx         # Add note form
├── shared/
│   ├── data-table.tsx              # Generic TanStack Table (Client)
│   ├── data-table-pagination.tsx
│   ├── data-table-toolbar.tsx
│   ├── timeline.tsx                # Activity timeline component
│   ├── label-selector.tsx          # Label multi-select
│   ├── phone-display.tsx           # Formatted phone display
│   └── entity-search.tsx           # Debounced search input
```

### Data Flow
```
Page (Server Component)
  → fetch initial data from NestJS API (with cookies)
  → pass to Client Component (table/kanban)
  → Client handles interaction (filter, sort, paginate, assign)
  → Client calls API via api-client.ts
  → Optimistic update UI → confirm on response
```

## Related Code Files

### Create
- All files listed in Architecture section above
- `apps/web/src/lib/lead-api.ts` — lead-specific API functions
- `apps/web/src/lib/customer-api.ts` — customer-specific API functions

### Modify
- `apps/web/src/components/layout/app-sidebar.tsx` — ensure lead/customer nav active states

## Implementation Steps

1. **Create shared data table component**
   - `data-table.tsx`: generic TanStack Table with column definitions, sorting, selection
   - `data-table-pagination.tsx`: cursor-based pagination controls (prev/next + page size)
   - `data-table-toolbar.tsx`: search input + filter triggers + bulk actions
   - Column visibility toggle, row selection (checkbox)

2. **Create shared components**
   - `timeline.tsx`: vertical timeline displaying activities (note, call, status change, etc.)
   - `label-selector.tsx`: multi-select dropdown for labels with color chips
   - `entity-search.tsx`: debounced search input component
   - `phone-display.tsx`: formatted VN phone display

3. **Build lead list page**
   - Server Component fetches initial leads from API
   - Request only needed fields from API for table view: `?fields=id,name,phone,status,source,assignedUser,createdAt`
   - Do NOT pass full lead objects (with metadata, JSONB, all relations) to client table component
   - `lead-table.tsx` (Client): TanStack Table with columns
   - `lead-filters.tsx` (Client): status, source, assigned user, department, date range
   - Filters sync to URL searchParams (useSearchParams)
   - Sort by: created_at, name, status (server-side sort)
   - Bulk actions: assign selected leads (manager+)
   - Preload lead detail data on row hover for faster navigation:
     `onMouseEnter={() => router.prefetch(`/leads/${lead.id}`)}`

4. **Build lead pool page**
   - Filter: `status=POOL` only
   - Manager view: see all pool leads in department
   - Bulk assign button: select leads → pick user → assign
   - Quick assign: click user avatar next to lead row

5. **Build lead kanban**
   - `lead-kanban-board.tsx`: columns for each status (POOL, ASSIGNED, IN_PROGRESS, CONVERTED, LOST)
   - `lead-kanban-card.tsx`: lead name, phone, source, assigned user
   - Drag-drop via `@dnd-kit/core` + `@dnd-kit/sortable`
   - Drop changes status (calls API), optimistic update
   - Use startTransition for optimistic status updates during drag-drop:
     ```ts
     function onDragEnd(event) {
       startTransition(() => {
         setLeads(prev => updateLeadStatus(prev, leadId, newStatus))
       })
       api.patch(`/leads/${leadId}`, { status: newStatus })
     }
     ```
   - Filter: by department, date range

6. **Build lead detail page**
   - Fetch lead data in parallel using Promise.all:
     ```ts
     const [lead, activities, labels] = await Promise.all([
       api.get(`/leads/${id}`),
       api.get(`/leads/${id}/activities`),
       api.get(`/labels`)
     ])
     ```
   - Or better: use parallel async Server Components, each wrapped in own Suspense boundary
   - `lead-detail-panel.tsx`: name, phone, email, status badge, source, assigned user, metadata
   - Activity timeline (load more pagination)
   - Apply CSS content-visibility on timeline items for scroll performance:
     `.timeline-item { content-visibility: auto; contain-intrinsic-size: 80px; }`
   - Labels section with add/remove
   - Conversion button (visible when status=IN_PROGRESS)
   - Assignment section (manager+): reassign button
   - Related customer info panel
   - Edit button → lead form in sheet/dialog

7. **Build lead create/edit form**
   - React Hook Form + Zod validation
   - Fields: name*, phone*, email, source (select), product (select), notes
   - Phone normalization preview (show normalized format)
   - Dedup check: on phone blur, check if lead exists → show warning

8. **Build customer SEARCH page** (not list)
   - Search input for phone number (with normalization preview)
   - On search: call API `/customers/search?phone=xxx`
   - Display single result card or "not found" message
   - Click result → navigate to customer detail

9. **Build customer detail page**
   - Info panel: name, phone, email, labels, assigned user/dept
   - Everyone can edit + add notes
   - Phone field: disabled for non-manager users
   - Leads tab: all leads linked to this customer
   - Orders tab: all orders for this customer
   - Timeline tab: combined activity timeline
   - Claim button (if unassigned + user in same department)
   - `customer-claim-button.tsx`: prominent button shown when customer.assigned_user_id is null and current user's department matches customer.assigned_department_id
   - Optimistic: immediately show as claimed, rollback on error
   - Race condition UX: if claim fails (already claimed), show toast + refresh

10. ~~Build customer list page~~ — replaced by search in Step 8

11. **Build customer create/edit form**
    - Customer edit form: React Hook Form + Zod, phone field disabled for non-manager
    - Customer create: only accessible from settings or auto-created during lead conversion

## Todo List

- [ ] Create generic data-table component (TanStack Table)
- [ ] Create data-table-pagination (cursor-based)
- [ ] Create data-table-toolbar (search, filters, bulk)
- [ ] Create shared timeline component
- [ ] Create label-selector component
- [ ] Build lead list page with table + filters
- [ ] Build lead Kho Mới page (manager+ only, POOL dept=null)
- [ ] Build lead Kho Phòng Ban page (NV dept, POOL dept=X)
- [ ] Build floating pool page (ALL users, leads + customers FLOATING)
- [ ] Build lead claim button (from dept pool + floating)
- [ ] Build lead transfer dialog (DEPARTMENT / FLOATING / UNASSIGN)
- [ ] Build lead kanban board (dnd-kit)
- [ ] Build lead detail page with timeline + labels
- [ ] Build lead create/edit form
- [ ] Build lead assign dialog
- [ ] Build customer search page (phone search only)
- [ ] Build customer search form
- [ ] Build customer detail page (leads, orders, timeline tabs)
- [ ] Build customer claim button
- [ ] Build customer edit form (phone disabled for non-manager)
- [ ] Build customer transfer dialog (DEPARTMENT / FLOATING / INACTIVE)
- [ ] Build customer INACTIVE button ("Đánh dấu hoàn tất")
- [ ] Build customer reactivate button (manager+, từ INACTIVE → ACTIVE)
- [ ] Implement URL-based filter state
- [ ] Implement optimistic updates for assign/claim
- [ ] Test dedup warning on phone input
- [ ] Test kanban drag-drop status change
- [ ] Build call-logs standalone page (/call-logs): list all calls, filter by match_status/date/phone
- [ ] Build unmatched calls queue view (manager+)

## Success Criteria

- Lead list renders with correct data, pagination, filters
- Filters persist in URL (shareable)
- Lead pool shows only unassigned leads
- Kanban drag-drop changes lead status via API
- Lead detail shows complete timeline with all activity types
- Lead conversion creates customer and updates status
- Customer search by phone returns correct results
- Customer phone field disabled for non-manager users
- Customer claim works with optimistic update
- Phone dedup warning appears on blur when duplicate found
- All pages responsive (desktop + mobile)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| TanStack Table learning curve | Low | Use simple column def pattern, reference shadcn examples |
| dnd-kit performance with many cards | Medium | Virtualize kanban columns if >50 cards per column |
| Optimistic update conflicts | Medium | Revalidate after mutation, show conflict toast |
| URL param sync complexity | Low | Use nuqs library or custom hook wrapping useSearchParams |
