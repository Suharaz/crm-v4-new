# UI/UX Design Patterns Research for Internal CRM System

**Date:** 2026-03-25
**Context:** Next.js + TypeScript + Tailwind CSS
**Scale:** 50-200 users
**Requirements:** Lead/customer management, order tracking, analytics, role-based access

---

## 1. Layout Architecture

### Primary Navigation Pattern
**Recommended:** Sidebar navigation + top header bar

**Structure:**
```
┌─────────────────────────────────────────┐
│  Logo  |  Breadcrumbs  | User Menu  🔔 │
├─────────┬───────────────────────────────┤
│         │                               │
│ Side    │     Main Content Area         │
│ Nav     │                               │
│ (250px) │  • Collapsible on mobile      │
│         │  • Persistent on desktop      │
│         │                               │
│ - Home  │                               │
│ - Leads │                               │
│ - Cust. │                               │
│ - Order │                               │
│ - Dash  │                               │
│ - Team  │                               │
│         │                               │
└─────────┴───────────────────────────────┘
```

**Key Features:**
- Fixed sidebar with collapsible menu on mobile
- Active route highlighting with subtle background
- Icon + label pairs for clarity
- Breadcrumbs for context (Dashboard > Leads > Lead Details)
- Notification badge on bell icon
- User avatar + dropdown menu in header

**Why:** Proven pattern for internal tools (HubSpot, Salesforce, Pipedrive). Sidebar keeps main content focused while preserving navigation accessibility.

---

## 2. Component Library Recommendation

### Decision Matrix

| Criteria | shadcn/ui | Ant Design | Material-UI |
|----------|-----------|-----------|-------------|
| **Tailwind Native** | ✅ 100% | ⚠️ Custom CSS | ⚠️ Emotion |
| **Customization** | ✅ Excellent | ⚠️ Good | ✅ Good |
| **Components** | ✅ 50+ | ✅ 60+ | ✅ 70+ |
| **Bundle Size** | ✅ Tiny (~15KB) | ⚠️ Medium (~300KB) | ❌ Large (~500KB) |
| **Learning Curve** | ✅ Easy | ⚠️ Moderate | ❌ Steep |
| **Dark Mode** | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| **Enterprise Feel** | ⚠️ Minimal | ✅ Professional | ✅ Professional |
| **Accessibility** | ✅ WAI-ARIA | ✅ WAI-ARIA | ✅ WAI-ARIA |

### Recommendation: **shadcn/ui** + Custom Components

**Why:**
1. **Tailwind-first** = zero CSS conflicts, ship with your app
2. **Copy-paste approach** = own the code, modify freely
3. **Minimal dependencies** = faster builds, smaller bundle
4. **Composable** = easy to build complex CRM components
5. **Community** = active ecosystem, many CRM examples

**Secondary choice:** Ant Design for data-heavy dashboards (pre-built DataGrid, Form validation)

---

## 3. DataTable/DataGrid Patterns

### Recommended Pattern: Hybrid Approach

**Use shadcn/ui Table** for:
- Simple CRUD lists (leads, customers, orders)
- Up to 500 rows without virtualization
- Minimal filtering/sorting

**Use TanStack React Table (v8+)** for:
- Complex DataGrids with thousands of rows
- Advanced filtering, column visibility toggles
- Inline editing, bulk actions
- Sorting by multiple columns

**Use Virtualization** (react-window, @tanstack/react-virtual) for:
- 5000+ rows
- Real-time data updates
- Mobile performance

### DataTable Features (Essential for CRM)

```
┌────────────────────────────────────────────────┐
│ [Filter] [Columns ⚙️] [Search 🔍]  [Add Lead] │
├────────────────────────────────────────────────┤
│ ☑ │ Name      │ Email      │ Status   │ [•••] │
├────────────────────────────────────────────────┤
│ ☑ │ John Doe  │ john@...   │ Prospect │ ✏️⋯   │
│ ☑ │ Jane Smith│ jane@...   │ Qualified│ ✏️⋯   │
│ ☑ │ Bob Jones │ bob@...    │ Converted│ ✏️⋯   │
├────────────────────────────────────────────────┤
│ [✓ 2 selected] [Delete] [Assign] [Export] │
│ Showing 3 of 157 | Page 1 of 53           │
└────────────────────────────────────────────────┘
```

### Must-Have Features

1. **Column Selection**
   - Sticky first column (checkbox/expand)
   - Toggle column visibility via dropdown
   - Reorderable columns (drag-drop)
   - Resizable columns

2. **Sorting & Filtering**
   - Click header to sort (asc/desc/none)
   - Visual indicator (↑↓) for active sort
   - Multi-column sorting (Shift+click)
   - Filterable columns (default: Name, Email, Status)
   - Advanced filter builder for custom queries

3. **Row Actions**
   - Hover-reveal actions: Edit, View, Delete
   - Right-click context menu
   - Quick action icons (eye, pencil, trash)
   - Row-expand for details (accordion style)

4. **Bulk Actions**
   - Checkbox to select rows
   - "Select all on page" or "Select all filtered"
   - Action bar appears when selected
   - Bulk: Delete, Assign, Change Status, Export CSV

5. **Inline Editing**
   - Click cell to edit
   - Keyboard navigation (Tab to next cell)
   - Esc to cancel, Enter to save
   - Validation feedback inline
   - Auto-save or manual save button

6. **Pagination**
   - Page size selector (10, 25, 50, 100)
   - Previous/Next buttons
   - Jump to page input
   - Total count and current range display

### Implementation Pattern (TanStack React Table)

```typescript
// hooks/useCRMTable.ts - Custom hook for CRM tables
import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table'

export function useCRMTable(data, columns, options) {
  return useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { columnVisibility, sorting, filtering },
    ...options
  })
}
```

---

## 4. Dashboard & Analytics Patterns

### Dashboard Layout Template

```
┌─────────────────────────────────────────────────────┐
│ Dashboard › Sales Pipeline                          │
├─────────────────────────────────────────────────────┤
│ [Date Range: This Month ▼] [Filters 📊] [Export]   │
├──────────────┬──────────────┬──────────────┬────────┤
│ Total Leads  │ Opportunities│ Conversion % │ Revenue│
│    247       │      52      │    21.05%    │$125K   │
├──────────────┴──────────────┴──────────────┴────────┤
│                                                     │
│  ┌─ Leads by Status (Pie) ──┐  ┌─ Pipeline Trend ──┐│
│  │  Prospect: 142            │  │  (Line Chart)      ││
│  │  Qualified: 67            │  │  ▁▂▃▄▅▆▇          ││
│  │  Negotiation: 23          │  │  Jan Feb Mar       ││
│  │  Won: 15                  │  └──────────────────┘│
│  └─────────────────────────┘                        │
│                                                     │
│  ┌─ Top Performers (Table) ────────────────────┐   │
│  │ John Smith: 24 deals | Jane Doe: 18 deals   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ Recent Activity (List) ────────────────────┐   │
│  │ • John assigned Lead #47 - 2 mins ago       │   │
│  │ • Pipeline updated: 3 deals > $50K - 10m    │   │
│  │ • Jane closed deal #234 - 45 mins ago       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### KPI Card Pattern (Metric Cards)

```tsx
// components/MetricCard.tsx
<div className="bg-white p-6 rounded-lg border">
  <div className="flex justify-between items-start">
    <div>
      <p className="text-sm text-gray-500">Total Leads</p>
      <h3 className="text-3xl font-bold">247</h3>
      <p className="text-sm text-green-600">↑ 12% from last month</p>
    </div>
    <Icon className="text-blue-500 text-2xl" />
  </div>
</div>
```

**Card Features:**
- Title + value + trend indicator
- Color coding: Green (good), Red (bad), Gray (neutral)
- Sparkline or percent change
- Click to drill-down to detailed list
- Skeleton loading state

### Chart Library Recommendation
- **Recharts** (React + Tailwind friendly)
- **Chart.js** (simplicity + performance)
- **Nivo** (enterprise charts, complex visualizations)

Avoid: plotly (heavy), D3 (overkill for CRM)

### Filter Bar Pattern

```
Date Range: [Start ▼] to [End ▼]
Status: [Select Multiple] ✕owner ✕priority
Team: [Dropdown]
Region: [Dropdown]
[Apply Filters] [Clear All] [Save Filter as: ___]
```

**Features:**
- Date range picker (Today, Week, Month, Custom)
- Multi-select dropdowns
- Applied filters shown as removable chips
- Save/load filter presets
- "Clear all" quick action

---

## 5. Lead/Customer Detail Page Layout

### Tab-Based Detail View

```
┌──────────────────────────────────────────────┐
│ ← John Doe (Lead #1247)                      │
├──────────────────────────────────────────────┤
│ 📋 Overview │ 📞 Contact │ 📈 History │ 📎 Files│
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ Overview Panel ──────────────────────┐  │
│  │ Status: Prospect  [Change Status ▼]   │  │
│  │ Source: LinkedIn                      │  │
│  │ Lead Value: $50K                      │  │
│  │ Assigned to: Sarah Johnson            │  │
│  │ Company: Acme Corp                    │  │
│  │ Contact Email: john@acme.com          │  │
│  │ Phone: (555) 123-4567                 │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  ┌─ Activity Timeline ───────────────────┐  │
│  │ 🔵 Email sent "Follow-up" - 2h ago    │  │
│  │ 🟢 Call completed - 1 day ago         │  │
│  │ 📧 Reply to: "Tell us more..." - 3d   │  │
│  │ 🔵 Lead created - 1 week ago          │  │
│  └───────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘

Right Sidebar (260px):
┌──────────────────────┐
│ Quick Actions        │
│ [Assign Lead]        │
│ [Schedule Call]      │
│ [Send Email]         │
│ [Convert to Customer]│
│ [Add Note]           │
│ [Merge with Contact] │
│ [Delete Lead]        │
└──────────────────────┘
```

### Section Content

**Overview Tab:**
- Company info (name, website, size, industry)
- Contact person details (name, email, phone, title)
- Lead metadata (source, value estimate, status, assigned rep)
- Custom fields (editable inline)
- Last activity date

**Contact Tab:**
- Email threads (collapsible)
- Call logs with recordings/notes
- SMS history
- Add new contact form

**History Tab:**
- Complete timeline of all interactions
- Status changes with timestamps
- Notes and comments
- Activity type icons (email, call, meeting, note)
- Filter by activity type

**Files Tab:**
- Attached documents
- Upload area
- Drag-drop support
- File preview (inline for images/PDFs)

---

## 6. Lead Pool/Kanban View

### Kanban Board Pattern

```
┌────────────────────────────────────────────────────────┐
│ Leads › Kanban View  [Switch to Table] [Add Column ➕] │
├────────────────────────────────────────────────────────┤
│ [Filter] [Sort by: Next Action ▼] [Auto-refresh: Off] │
├─────────────┬────────────┬──────────────┬────────────┬──────┤
│ New (23)    │ Contacted  │ Qualified (8)│ Negotiating│ Won   │
│             │ (12)       │              │ (5)        │ (42)  │
├─────────────┼────────────┼──────────────┼────────────┼──────┤
│             │            │              │            │       │
│ ┌────────┐  │ ┌────────┐ │ ┌────────┐  │ ┌────────┐ │ ┌────┐│
│ │ Lead   │  │ │ Lead   │ │ │ Lead   │  │ │ Lead   │ │ │Deal││
│ │ #1047  │  │ │ #1045  │ │ │ #1023  │  │ │ #988   │ │ │ #42││
│ │ John D │  │ │ Jane S │ │ │ Bob J  │  │ │ Alice M│ │ │$1.2M│
│ │ ABC    │  │ │ Corp Z │ │ │ Tech Co│  │ │ Global │ │ │Acme │
│ │ $50K   │  │ │ $75K   │ │ │ $100K  │  │ │ $150K  │ │ │     │
│ └────────┘  │ └────────┘ │ └────────┘  │ └────────┘ │ │└────┘│
│             │            │              │            │       │
│ ┌────────┐  │            │ ┌────────┐  │ ┌────────┐ │       │
│ │ Lead   │  │            │ │ Lead   │  │ │ Lead   │ │       │
│ │ #1046  │  │            │ │ #1022  │  │ │ #987   │ │       │
│ │ Sarah L│  │            │ │ Mike P │  │ │ David B│ │       │
│ │ Start  │  │            │ │ Media  │  │ │ Finance│ │       │
│ │ $60K   │  │            │ │ $80K   │  │ │ $200K  │ │       │
│ └────────┘  │            │ └────────┘  │ └────────┘ │       │
│             │            │              │            │       │
└─────────────┴────────────┴──────────────┴────────────┴──────┘
```

### Kanban Card Design

```
┌─────────────────┐
│ ▌ Lead #1047    │ ← Priority indicator (color)
│ John Doe        │
│ ABC Corp        │ ← Company
│ $50,000         │ ← Value
│ Sarah Johnson   │ ← Assigned to
│ Next: Call 2h ▶ │ ← Next action
│                 │
│ 📧📞 👤         │ ← Quick actions
└─────────────────┘
```

**Features:**
- Drag-drop between columns
- Column count badges
- Card click reveals preview
- Double-click to open full modal
- Assigned user avatar
- Priority/status color indicator
- Next action badge (auto-calc from timeline)
- Context menu: View, Assign, Delete, Archive

**Implementation:** Use react-beautiful-dnd or @dnd-kit

---

## 7. Form UX Patterns for CRM

### Multi-Step Form (Lead Creation)

```
Step 1: Basic Info  ✓
Step 2: Contact    →  (current)
Step 3: Details
Step 4: Review

Form Progress: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 50%

┌────────────────────────────────────────────┐
│ Contact Information                        │
│                                            │
│ Email: [_____________________]  ✓          │
│ Phone: [_____________________]             │
│ LinkedIn: [_____________________]          │
│ Alternate Email: [_____________________]   │
│                                            │
│ [← Back] [Next →]  [Save Draft]           │
└────────────────────────────────────────────┘
```

**Features:**
- Visual progress indicator
- Step validation (must complete to advance)
- Save draft option
- Previous/Next navigation
- Auto-save in background
- Show errors inline, not on submission

### Dynamic Fields (Conditional Logic)

```
Lead Type: [Select: B2B / B2C]

[If B2B selected]:
  Company Name: [___]
  Number of Employees: [___]
  Industry: [Select: ...]
  Decision Maker: [___]

[If B2C selected]:
  Annual Income: [___]
  Personal Use: [Checkbox]
  Preferred Contact: [Phone/Email/SMS]
```

### Inline Validation Pattern

```
Email: [john@example.com]  ✓ Valid email
       ↑
       Validates as you type, shows status immediately
       Green checkmark = valid
       Red X = invalid
       Helpful message below input

Password Strength:
[████████░░░░░░░░░░] Strong

Requirements:
☑ 8+ characters
☑ Uppercase letter
☑ Number
☐ Special character
```

### JSONB Metadata Editor

For custom fields stored in JSONB:

```
Custom Fields
[+ Add Custom Field]

Key: [_____________]  Value: [_____________]  [✕]
Key: [_____________]  Value: [_____________]  [✕]
Key: [_____________]  Value: [_____________]  [✕]

Preset Templates:
[Insurance Info] [Financial Details] [+More]
```

Or use key-value grid:
```
┌────────────────────────────────────────┐
│ Key              │ Value        │ [✕]  │
├────────────────────────────────────────┤
│ registration_id  │ REG-2024-001 │      │
│ annual_spend     │ $50,000      │      │
│ contract_expires │ 2026-12-31   │      │
│ [+ Add Field]                         │
└────────────────────────────────────────┘
```

---

## 8. Color System & Theming

### Status Colors (Standardized)

```
Leads:
  🔵 New/Prospect       → #3B82F6 (Blue)
  🟡 Contacted/Engaged  → #F59E0B (Amber)
  🟢 Qualified          → #10B981 (Green)
  🟣 Negotiating        → #8B5CF6 (Purple)
  ⚫ Won/Closed          → #1F2937 (Gray-900)
  ⚪ Lost/Archived       → #D1D5DB (Gray-300)

Priority:
  🔴 Critical/High      → #EF4444
  🟠 Medium             → #F97316
  🟡 Low                → #FBBF24

Activity:
  📧 Email              → #3B82F6
  📞 Call               → #06B6D4
  📅 Meeting            → #8B5CF6
  📝 Note               → #F59E0B
  ✅ Task               → #10B981
```

### Light/Dark Mode Implementation

```tsx
// app/layout.tsx
<html className="light">
  <body className="bg-white dark:bg-slate-950 text-gray-900 dark:text-gray-50">
    {children}
  </body>
</html>

// Tailwind config
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        crm: {
          primary: '#3B82F6',    // Lead blue
          secondary: '#F59E0B',  // Action amber
          success: '#10B981',    // Win green
          danger: '#EF4444',     // Critical red
        }
      }
    }
  }
}
```

### Theme Variables

For CRM-specific styling:
```css
:root {
  --crm-primary: #3B82F6;        /* Lead status */
  --crm-secondary: #F59E0B;      /* Action/warning */
  --crm-success: #10B981;        /* Conversion/win */
  --crm-danger: #EF4444;         /* Critical/lost */
  --crm-neutral: #6B7280;        /* Archive/inactive */

  --sidebar-width: 16rem;        /* 256px */
  --header-height: 3.5rem;       /* 56px */
  --border-radius: 0.5rem;       /* 8px */
}
```

---

## 9. Responsive Design Strategy

### Desktop-First Approach (Recommended for Internal Tools)

**Why:**
- 90%+ of CRM usage is desktop
- Complex tables/dashboards don't scale well to mobile
- Reduces feature bloat

**Breakpoints:**
```css
/* Tailwind defaults, use these in CRM context */
sm: 640px   /* Tablet */
md: 768px   /* Small laptop */
lg: 1024px  /* Standard laptop */
xl: 1280px  /* Large display */
2xl: 1536px /* Ultra-wide */

CRM Target: lg (1024px) minimum
Secondary: md (768px) for light usage
```

### Responsive Table Pattern

**Desktop (≥1024px):**
- Full DataTable with all columns visible
- Sidebar navigation fixed

**Tablet (768-1024px):**
- Hide low-priority columns (notes, created_date)
- Sidebar collapsible
- Horizontal scroll for table

**Mobile (<768px):**
- Convert table to card list
- Stack information vertically
- Single-column layout
- Collapse sidebar by default

```tsx
// Hidden on small screens
<th className="hidden md:table-cell">Notes</th>
<th className="hidden lg:table-cell">CreatedAt</th>

// Mobile card view
<div className="md:hidden space-y-4">
  {leads.map(lead => (
    <LeadCard key={lead.id} lead={lead} />
  ))}
</div>
```

---

## 10. Accessibility (WCAG 2.1 AA)

### Critical for Internal Tools

**Focus Management:**
- Keyboard navigation everywhere
- Visible focus indicator (outline: 2px solid currentColor)
- Tab order matches visual layout
- Skip to main content link

**ARIA Labels:**
```tsx
// Tables
<table role="grid" aria-label="Leads list">
  <thead role="rowgroup">
    <tr role="row">
      <th role="columnheader" aria-sort="ascending">Name</th>
    </tr>
  </thead>
</table>

// Modal dialogs
<div role="dialog" aria-labelledby="dialog-title" aria-modal="true">
  <h2 id="dialog-title">Delete Lead?</h2>
</div>

// Form validation
<input aria-invalid={!!error} aria-describedby="error-msg" />
<span id="error-msg" className="text-red-600">{error}</span>
```

**Color Contrast:**
- Text ≥ 4.5:1 ratio (normal) / 3:1 (large)
- Don't rely solely on color (use icons + text)
- Status indicators: Color + text + icon

**Semantic HTML:**
- Use `<button>` for buttons (not `<div>`)
- Use `<nav>` for navigation
- Use `<main>` for primary content
- Use heading hierarchy (`<h1>` → `<h2>` → `<h3>`)

---

## 11. Toast/Notification Patterns

### CRM Action Toasts

```
Success:
┌──────────────────────────────┐
│ ✅ Lead assigned to Sarah    │ [×]
│    [Undo]                    │
└──────────────────────────────┘

Error:
┌──────────────────────────────┐
│ ❌ Failed to update lead     │ [×]
│    Network error. Try again  │
│    [Retry] [Dismiss]         │
└──────────────────────────────┘

Info:
┌──────────────────────────────┐
│ ℹ️  3 new leads assigned     │ [×]
│    [View List]               │
└──────────────────────────────┘

Loading:
┌──────────────────────────────┐
│ ⏳ Converting lead...         │
│    [Cancel]                  │
└──────────────────────────────┘
```

**Features:**
- Auto-dismiss after 5 seconds (except errors)
- Stack multiple toasts (max 3)
- Position: top-right (or bottom-right)
- Action buttons: Undo, Retry, View, Dismiss
- Close button (×)
- Icon + color coding

**Use react-hot-toast or sonner:**
```tsx
import { toast } from 'sonner'

toast.success('Lead assigned to Sarah', {
  action: { label: 'Undo', onClick: () => undoAssign() },
  duration: 5000,
})
```

### Contextual Confirmations

For destructive actions:
```
┌─────────────────────────────────────┐
│ ⚠️  Delete lead "John Doe"?         │
│                                     │
│ This cannot be undone.              │
│                                     │
│ [Cancel] [Delete]                   │
└─────────────────────────────────────┘
```

---

## 12. Search & Filter UX

### Global Search Pattern

```
Header search bar (always visible):
┌──────────────────────────────────────┐
│ 🔍 Search leads, customers, orders... │
└──────────────────────────────────────┘

Results appear as dropdown:
┌────────────────────────────────────┐
│ 📄 Leads (3)                        │
│   • John Doe (lead #1047)           │
│   • Jane Smith (lead #1023)         │
│   • John Corp (lead #988)           │
│                                     │
│ 👤 Customers (2)                    │
│   • Acme Corp                       │
│   • TechStart Inc                   │
│                                     │
│ 📦 Orders (5)                       │
│   • Order #ORD-2024-001             │
│   • Order #ORD-2024-002             │
│                                     │
│ [View all results for "john"]       │
└────────────────────────────────────┘
```

**Implementation:**
- Debounced search (300ms)
- Category grouping
- Keyboard navigation (arrow keys, Enter)
- Escape to close
- Recent searches stored
- Search within context (search only Leads when on Leads page)

### Advanced Filters UI

```
Filter Bar:
[Status ▼] [Owner ▼] [Created ▼] [Value ▼] [+ More Filters]

Inline filters:
Status: [New ✕] [Contacted ✕] [Qualified]
Owner: [Sarah Johnson ✕] [All Users ▼]
Created: [Last 30 Days ▼]
Value: [Min: ___] to [Max: ___]
Company: [_______________] 🔍

Applied Filters: 4 active
[Clear All]

Saved Filters:
[High Priority Leads] [Hot Prospects] [My Pipeline]
```

**Features:**
- Default filters visible
- "+ More Filters" expands advanced options
- Applied filters as removable chips
- Save filter combinations as named presets
- Quick filter templates

---

## Summary Recommendations

### Must-Have Components

1. **Sidebar Navigation** - Collapsible, icon-based, with active state
2. **DataTable** - TanStack React Table with sorting, filtering, pagination, bulk actions
3. **KPI Cards** - Trend indicators, clickable drill-down
4. **Modal Dialogs** - For detail views, confirmations, forms
5. **Toast Notifications** - Action feedback, errors, undos
6. **Breadcrumbs** - Context navigation
7. **Tab Navigation** - For detail pages (Overview, Contact, History, Files)
8. **Search Bar** - Global search with category grouping
9. **Date/Time Pickers** - For filters and date fields
10. **Progress Indicators** - For multi-step forms, loading states

### Technology Stack

| Layer | Recommendation | Alternative |
|-------|---|---|
| **UI Components** | shadcn/ui | Ant Design |
| **Data Tables** | TanStack React Table + shadcn | React Big Calendar |
| **Forms** | React Hook Form + Zod | Formik + Yup |
| **Charts** | Recharts | Chart.js |
| **Kanban** | @dnd-kit | react-beautiful-dnd |
| **Date Picker** | react-day-picker | date-fns UI |
| **Toast** | sonner | react-hot-toast |
| **Dark Mode** | next-themes | Manual |
| **Styling** | Tailwind CSS | CSS Modules |

### File Structure (Next.js App Router)

```
app/
├── layout.tsx                  # Root layout (nav, theme)
├── dashboard/
│   ├── page.tsx               # Main dashboard
│   ├── components/
│   │   ├── MetricCard.tsx
│   │   ├── ChartCard.tsx
│   │   └── ActivityFeed.tsx
│   └── layout.tsx
├── leads/
│   ├── page.tsx               # Leads list (DataTable)
│   ├── [id]/
│   │   ├── page.tsx           # Lead detail
│   │   └── components/
│   │       ├── DetailPanel.tsx
│   │       ├── TimelineView.tsx
│   │       └── ActivityPanel.tsx
│   └── components/
│       ├── LeadsTable.tsx
│       ├── LeadCard.tsx (Kanban)
│       └── LeadFilters.tsx
├── customers/                 # Similar structure
├── orders/                     # Similar structure
└── components/
    ├── ui/                    # shadcn/ui imported components
    ├── layout/
    │   ├── Sidebar.tsx
    │   ├── Header.tsx
    │   └── MainLayout.tsx
    ├── forms/
    │   ├── LeadForm.tsx
    │   └── CustomerForm.tsx
    └── shared/
        ├── DataTable.tsx
        ├── Modal.tsx
        └── Toast.tsx
```

---

## Unresolved Questions

1. **Authentication UI:** Do you need OAuth2 integration, SAML, or simple email/password? This affects login flow design.
2. **Mobile Requirements:** Is mobile support (50-80% responsive) a hard requirement or nice-to-have?
3. **Real-time Updates:** Do Kanban columns and dashboards need real-time sync (WebSocket) or periodic polling?
4. **Custom Branding:** Should theme colors be configurable per-organization (multi-tenant)?
5. **Export Formats:** Beyond CSV, do you need PDF reports, Excel with formatting, or custom report builder?
6. **Advanced Analytics:** Do you need custom dashboard builder (no-code widget arrangement) or pre-built dashboards?
7. **Collaboration Features:** Do you need @mentions, comments, inline collaboration, or just activity logs?
8. **Audit Trail:** How detailed does the change history need to be (field-level or action-level)?
9. **Performance Baseline:** What's acceptable load time for tables with 10K+ records (pagination vs virtualization)?
10. **Offline Support:** Do sales reps need offline mode to work without internet (sync when back online)?
