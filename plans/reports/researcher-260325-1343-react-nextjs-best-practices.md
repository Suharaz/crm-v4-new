# React & Next.js Best Practices for CRM Systems
**Research Report** | Date: 2026-03-25 | Context: Internal CRM (50-200 users, no real-time, analytics dashboards)

---

## Executive Summary

For a NestJS API + Next.js frontend CRM built on Turborepo:
- **App Router + Server Components** as default (not Pages Router)
- **Server Actions** for mutations + form handling (not REST API calls from client)
- **TanStack Query** only if you need client-side caching/refetch logic; otherwise use native fetch in Server Components
- **TanStack Table** for large data lists (optimized virtualization for thousands of rows)
- **React Hook Form** + Zod for complex, dynamic CRM forms
- **Minimal global state** — use props drilling + Server Components + Context for auth/user
- **Proxy (formerly Middleware)** for authentication check + JWT validation
- **Suspense + loading.js** for progressive rendering of dashboard sections

---

## 1. Next.js App Router: Architecture & File Structure

### Turborepo Monorepo Structure
```
crm-v3/
├── packages/
│   ├── api/              # NestJS backend (separate concern)
│   ├── shared/           # Shared types, utilities, constants
│   │   ├── src/types/
│   │   ├── src/utils/
│   │   └── src/schemas/  # Zod schemas for validation
│   └── ui/               # Reusable UI components (optional)
└── apps/
    └── web/              # Next.js frontend
        ├── src/
        │   ├── app/                    # App Router (file-based routing)
        │   │   ├── (auth)/             # Route group (no URL segment)
        │   │   │   ├── login/
        │   │   │   └── register/
        │   │   ├── (dashboard)/        # Protected routes group
        │   │   │   ├── layout.tsx      # Dashboard layout with nav
        │   │   │   ├── page.tsx        # Dashboard home
        │   │   │   ├── leads/
        │   │   │   │   ├── page.tsx    # List view (Server Component)
        │   │   │   │   ├── [id]/
        │   │   │   │   │   └── page.tsx # Detail view (Server Component)
        │   │   │   │   └── loading.tsx
        │   │   │   ├── customers/
        │   │   │   ├── orders/
        │   │   │   └── analytics/      # Dashboard charts
        │   │   ├── api/                # Route handlers (optional, use NestJS instead)
        │   │   ├── layout.tsx          # Root layout
        │   │   └── not-found.tsx
        │   ├── components/
        │   │   ├── ui/                 # Reusable UI (buttons, cards, etc)
        │   │   ├── forms/              # Form components
        │   │   └── tables/             # Table/DataGrid components
        │   ├── lib/
        │   │   ├── api.ts              # API client helpers
        │   │   ├── auth.ts             # Auth utilities
        │   │   └── constants.ts
        │   ├── hooks/                  # Custom React hooks
        │   ├── actions/                # Server Actions (mutations)
        │   └── middleware.ts           # Proxy auth check (now called proxy.ts in v16)
        └── next.config.js
```

### Key Principles:
- **No `pages/` directory** — migrate to App Router (v13+)
- **Route groups** `(name)` — organize without URL segments
- **Colocation** — place components near where used (not in `/components` necessarily)
- **Server Components by default** — add `'use client'` only where needed
- **`loading.tsx`** wraps page in Suspense automatically

---

## 2. Server Components vs Client Components

### When to Use Server Components (DEFAULT)

**Use Server Components for:**
1. **Data fetching from DB/APIs** — direct Prisma queries or fetch to NestJS backend
2. **Secret data** — API keys, tokens, sensitive logic
3. **Large dependencies** — libraries that don't need to ship to browser
4. **Database access** — using Prisma directly

**Example: List View (Server Component)**
```tsx
// app/dashboard/leads/page.tsx (Server Component - no 'use client')
import { LeadsTable } from '@/components/tables/leads-table'
import { getLeads } from '@/lib/api'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const { page = '1', status } = await searchParams
  const leads = await getLeads({ page: parseInt(page), status })

  return (
    <div>
      <h1>Leads</h1>
      <LeadsTable leads={leads} />
    </div>
  )
}
```

### When to Use Client Components

**Use Client Components ONLY for:**
1. **Interactivity** — `useState`, `onChange`, `onClick`
2. **Hooks** — `useEffect`, custom hooks
3. **Browser APIs** — `localStorage`, `window`, `geolocation`
4. **Event handlers** — form submission, clicks

**Example: Interactive Table (Client Component)**
```tsx
// components/tables/leads-table.tsx
'use client'

import { useTransition } from 'react'
import { Lead } from '@/types'
import { deleteLead } from '@/actions/leads'

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteLead(id)
    })
  }

  return (
    <table>
      {/* Render leads */}
      {leads.map(lead => (
        <tr key={lead.id}>
          <td>{lead.name}</td>
          <td>
            <button
              onClick={() => handleDelete(lead.id)}
              disabled={isPending}
            >
              Delete
            </button>
          </td>
        </tr>
      ))}
    </table>
  )
}
```

### CRITICAL: Minimize Client Bundle

Keep `'use client'` boundaries small:
```tsx
// ❌ WRONG: Entire layout is client
'use client'
export function DashboardLayout({ children }) {
  return <div>{children}</div>
}

// ✅ CORRECT: Only interactive part is client
export function DashboardLayout({ children }) {
  return (
    <div>
      <Header />        {/* Server Component */}
      <Sidebar />       {/* Server Component */}
      <Search />        {/* Client Component (imported) */}
      {children}
    </div>
  )
}

// components/search.tsx
'use client'
export function Search() { /* ... */ }
```

---

## 3. Data Fetching Patterns

### Pattern: Server Components + Direct API Calls (RECOMMENDED FOR CRM)

**Why:** No client-side state management needed for read operations.

```tsx
// app/dashboard/leads/page.tsx
import { cache } from 'react'

// Wrap fetch in cache() to deduplicate identical requests within same render
const getLeads = cache(async (filters?: Record<string, any>) => {
  const query = new URLSearchParams(filters)
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/leads?${query}`, {
    headers: {
      'Authorization': `Bearer ${process.env.API_SECRET}`, // Server-only!
    },
    // Default: cache = 'force-cache' (static). Use dynamic for real-time data:
    cache: 'no-store' // Disable caching for always-fresh data
  })
  if (!res.ok) throw new Error('Failed to fetch leads')
  return res.json()
})

export default async function LeadsPage({ searchParams }) {
  const { page = '1' } = await searchParams
  const leads = await getLeads({ page })

  return <LeadsTable leads={leads} />
}
```

**Key Decisions:**
- `cache: 'no-store'` — CRM data changes frequently, disable HTTP cache
- `cache()` function — deduplicate identical fetches in same request
- No React Query needed — Suspense handles loading states

---

### Pattern: Client-Side Data Fetching (Only When Needed)

**When to use TanStack Query:**
- Client-side filtering on millions of rows (rare for CRM)
- Real-time updates (not needed per requirements)
- Client-initiated refetching after mutations

**When to use Server Actions instead:**
- 95% of CRM use cases
- Form submissions
- Mutations (CREATE/UPDATE/DELETE)

---

### Server Actions for Mutations (RECOMMENDED FOR CRM)

```tsx
// app/actions/leads.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'

export async function createLead(formData: FormData) {
  const name = formData.get('name') as string

  // Validate on server
  if (!name || name.length < 2) {
    return { error: 'Name must be at least 2 characters' }
  }

  try {
    const lead = await prisma.lead.create({
      data: { name, status: 'new' }
    })

    // Revalidate cache for list page
    revalidatePath('/dashboard/leads')

    return { success: true, lead }
  } catch (error) {
    return { error: 'Failed to create lead' }
  }
}

export async function deleteLead(id: string) {
  await prisma.lead.delete({ where: { id } })
  revalidatePath('/dashboard/leads')
}

export async function updateLead(id: string, data: Partial<Lead>) {
  const lead = await prisma.lead.update({
    where: { id },
    data
  })
  revalidatePath(`/dashboard/leads/${id}`)
  return lead
}
```

**Using Server Actions in Forms:**
```tsx
// components/forms/lead-form.tsx
'use client'

import { useActionState } from 'react'
import { createLead } from '@/actions/leads'

export function CreateLeadForm() {
  const [state, formAction, isPending] = useActionState(createLead, null)

  return (
    <form action={formAction}>
      <input name="name" type="text" required />
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Lead'}
      </button>
      {state?.error && <div className="error">{state.error}</div>}
    </form>
  )
}
```

---

## 4. State Management for CRM

### Hierarchy (Simplest to Most Complex)

| Level | Use Case | Library | Example |
|-------|----------|---------|---------|
| **Local State** | Single component | `useState` | Form input, toggle |
| **Shared Component State** | 2-3 related components | Props drilling | Filter state passed down |
| **Layout State** | Entire dashboard | `useContext` | Auth user, theme |
| **URL State** | Filtering, sorting, pagination | `searchParams` | `/leads?status=active&page=2` |
| **Client Cache** | Complex data sync | TanStack Query | Only if needed |

### Recommended: Minimal Global State

```tsx
// app/providers.tsx (Wrap in layout)
'use client'

import { ReactNode, createContext, useContext, useCallback } from 'react'
import { User } from '@/types'

interface AuthContextType {
  user: User | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({
  children,
  user: initialUser
}: {
  children: ReactNode
  user: User | null
}) {
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user: initialUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be in AuthProvider')
  return context
}
```

```tsx
// app/layout.tsx
import { AuthProvider } from '@/providers'
import { getSession } from '@/lib/auth'

export default async function RootLayout({ children }) {
  const user = await getSession()

  return (
    <html>
      <body>
        <AuthProvider user={user}>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
```

**Avoid:** Redux, Zustand for CRM. They add complexity without benefit when using Server Components.

---

## 5. Form Handling for Complex CRM Forms

### Tech Stack: React Hook Form + Zod

```tsx
// lib/schemas/lead.ts
import { z } from 'zod'

export const leadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'lost']),
  metadata: z.record(z.any()).optional(), // JSONB support
})

export type Lead = z.infer<typeof leadSchema>
```

```tsx
// components/forms/lead-form.tsx
'use client'

import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadSchema, type Lead } from '@/lib/schemas/lead'
import { updateLead } from '@/actions/leads'

interface LeadFormProps {
  initialData?: Lead
}

export function LeadForm({ initialData }: LeadFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Lead>({
    resolver: zodResolver(leadSchema),
    defaultValues: initialData,
  })

  const [state, formAction] = useActionState(
    async (prev, formData) => {
      const data = Object.fromEntries(formData)
      return updateLead(initialData?.id, data)
    },
    null
  )

  return (
    <form action={formAction} onSubmit={handleSubmit((data) => {
      const formData = new FormData()
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value as string)
      })
    })}>

      <label>
        Name
        <input {...register('name')} />
        {errors.name && <span>{errors.name.message}</span>}
      </label>

      <label>
        Email
        <input {...register('email')} />
        {errors.email && <span>{errors.email.message}</span>}
      </label>

      <label>
        Status
        <select {...register('status')}>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
        </select>
      </label>

      <button disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Lead'}
      </button>
    </form>
  )
}
```

**Key Features:**
- Client-side validation + server-side validation (in Server Action)
- JSONB metadata support via `z.record()`
- Optimistic UI updates via `useTransition`

---

## 6. Table/DataGrid Solutions

### TanStack Table (React Table) for Large Datasets

**When:** 100+ rows, need sorting/filtering/pagination

```tsx
// components/tables/leads-table.tsx
'use client'

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Lead } from '@/types'

const columns: ColumnDef<Lead>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => row.getValue('name'),
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return <span className={`badge badge-${status}`}>{status}</span>
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <button onClick={() => console.log(row.original.id)}>
        Edit
      </button>
    ),
  },
]

interface LeadsTableProps {
  leads: Lead[]
}

export function LeadsTable({ leads }: LeadsTableProps) {
  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <table>
        <thead>
          {table.getHeaderGroups().map(group => (
            <tr key={group.id}>
              {group.headers.map(header => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : (
                    <button onClick={() => header.column.toggleSorting()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </button>
        <span>{table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
      </div>
    </div>
  )
}
```

**Alternatives:**
- **shadcn/ui DataTable** — Same as TanStack Table but styled
- **AG Grid** — Enterprise features, paid, overkill for most CRM
- **Datagrid from MUI** — For Material Design look

---

## 7. Authentication & Protected Routes

### Proxy (Middleware) for JWT Validation

```tsx
// proxy.ts (in project root, same level as app/)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const token = request.cookies.get('token')?.value

  // Public routes
  if (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/register')) {
    if (token) {
      // Already logged in, redirect to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Validate token (basic check, proper validation in server action)
    try {
      // Could decode token here if needed
      return NextResponse.next()
    } catch {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

### Session Management

```tsx
// lib/auth.ts
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  if (!token) return null

  try {
    const verified = await jwtVerify(token, secret)
    return verified.payload as any
  } catch (error) {
    return null
  }
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}
```

---

## 8. Performance: Suspense & Streaming

### Progressive Rendering with Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react'
import { DashboardCards } from '@/components/dashboard-cards'
import { AnalyticsChart } from '@/components/analytics-chart'
import { CardSkeleton, ChartSkeleton } from '@/components/skeletons'

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Quick stats - load fast */}
      <Suspense fallback={<div className="grid gap-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}>
        <DashboardCards />
      </Suspense>

      {/* Heavy analytics - stream in later */}
      <Suspense fallback={<ChartSkeleton />}>
        <AnalyticsChart />
      </Suspense>
    </div>
  )
}
```

### Streaming Configuration

```tsx
// next.config.js
module.exports = {
  experimental: {
    // Enable streaming for better performance
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}
```

---

## 9. Chart/Visualization Libraries

### Recommended for Analytics Dashboards

| Library | Pros | Cons | Size |
|---------|------|------|------|
| **Recharts** | React-native, easy, good defaults | Limited customization | ~45kb |
| **Visx** (Airbnb) | Highly customizable, composable | Steeper learning curve | ~35kb |
| **Chart.js** | Battle-tested, many integrations | Not React-native | ~60kb |
| **Plotly.js** | Advanced 3D/complex charts | Heavy, overkill for most CRM | ~150kb+ |

**Recommended: Recharts** for CRM analytics

```tsx
// components/analytics-chart.tsx
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export async function AnalyticsChart() {
  const data = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analytics`, {
    cache: 'no-store'
  }).then(r => r.json())

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="leads" stroke="#8884d8" />
        <Line type="monotone" dataKey="conversions" stroke="#82ca9d" />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

---

## 10. Library Versions & Recommendations

### Core Stack (as of March 2026)

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "@hookform/resolvers": "^3.4.0",
    "react-hook-form": "^7.52.0",
    "zod": "^3.24.0",
    "@tanstack/react-table": "^8.21.0",
    "recharts": "^2.12.0",
    "jose": "^5.6.0",
    "prisma": "^6.2.0",
    "@prisma/client": "^6.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0"
  }
}
```

### Why These Libraries?

- **Next.js 16** — Latest App Router, improved performance
- **React 19** — Better Server Component support, useActionState
- **React Hook Form** — Minimal bundle, excellent for CRM forms
- **Zod** — Type-safe validation (used by Next.js team)
- **TanStack Table** — Only if needed; lean table library
- **Recharts** — Simple, React-first charting
- **Jose** — JWT handling (lightweight)
- **Prisma** — Type-safe ORM (shared with NestJS if desired)

### Skip These (Not Needed for CRM):
- Redux, Redux Toolkit — Too much boilerplate
- SWR — Server Actions are simpler
- Apollo Client — Only needed if using GraphQL
- Next.js API Routes — Use NestJS backend instead
- Next-Auth.js — Use manual JWT + cookies instead (simpler)

---

## 11. Code Organization & File Structure

### Recommended Directory Layout

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx           # Server Component
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/               # Protected routes
│   │   ├── layout.tsx             # Navigation, sidebar
│   │   ├── page.tsx               # Dashboard home
│   │   ├── leads/
│   │   │   ├── page.tsx           # List (Server + Suspense)
│   │   │   ├── loading.tsx        # Auto-wrapped Suspense
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx       # Detail view
│   │   │   │   └── loading.tsx
│   │   │   └── new/
│   │   │       └── page.tsx       # Create form
│   │   ├── customers/
│   │   ├── orders/
│   │   ├── analytics/
│   │   │   └── page.tsx           # Charts + Suspense
│   │   └── settings/
│   ├── proxy.ts                   # Authentication middleware
│   ├── layout.tsx                 # Root layout
│   └── not-found.tsx
├── components/
│   ├── ui/                        # Reusable: Button, Card, Dialog
│   ├── forms/                     # Form components
│   ├── tables/                    # Table/DataGrid components
│   ├── charts/                    # Chart components
│   ├── layouts/                   # Complex layout components
│   └── skeletons/                 # Loading skeletons
├── hooks/                         # Custom hooks (useAuth, useFetch, etc)
├── actions/                       # Server Actions (mutations)
├── lib/
│   ├── api.ts                     # Fetch helpers, API client
│   ├── auth.ts                    # Session management, getSession()
│   ├── constants.ts               # API URLs, enums
│   └── utils.ts                   # Utility functions
├── types/                         # TypeScript types/interfaces
├── schemas/                       # Zod schemas
└── styles/                        # Global CSS, Tailwind config
```

### Naming Conventions

- **Files**: kebab-case (e.g., `lead-form.tsx`, `dashboard-cards.tsx`)
- **Folders**: kebab-case (e.g., `lead-modal/`, `user-profile/`)
- **Components**: PascalCase (e.g., `LeadForm`, `DashboardCards`)
- **Functions**: camelCase (e.g., `getLeads()`, `updateLead()`)
- **Server Actions**: kebab-case files, camelCase functions (e.g., `app/actions/leads.ts` exports `createLead()`)

---

## 12. Common CRM Patterns & Solutions

### Pattern: List + Filter + Pagination (Server-Rendered)

```tsx
// app/dashboard/leads/page.tsx
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; search?: string }>
}) {
  const { page = '1', status, search } = await searchParams

  const leads = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/leads?${new URLSearchParams({
      page: page.toString(),
      ...(status && { status }),
      ...(search && { search }),
    })}`,
    { cache: 'no-store' }
  ).then(r => r.json())

  return (
    <div>
      <LeadFilters />
      <LeadsTable leads={leads} />
    </div>
  )
}
```

### Pattern: Detail View + Edit Form

```tsx
// app/dashboard/leads/[id]/page.tsx
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lead = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/leads/${id}`,
    { cache: 'no-store' }
  ).then(r => r.json())

  return (
    <div>
      <LeadHeader lead={lead} />
      <LeadForm initialData={lead} />
      <LeadActivity leadId={id} />
    </div>
  )
}
```

### Pattern: Modal Form (Client Component)

```tsx
// components/modals/create-lead-modal.tsx
'use client'

import { useState } from 'react'
import { createLead } from '@/actions/leads'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'

export function CreateLeadModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>New Lead</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>Create Lead</DialogHeader>
          <LeadForm onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
```

---

## 13. Unresolved Questions & Gaps

1. **Real-time updates** — Requirements say no real-time needed, but if added later, need to switch to WebSocket solution (Socket.io, Centrifugo)
2. **PDF export** — Not mentioned; would recommend puppeteer or similar
3. **Bulk operations** — How to handle bulk edit/delete? May need specialized UI pattern
4. **Advanced search** — Full-text search or ElasticSearch integration? Currently assuming simple SQL filters
5. **File uploads** — Not mentioned; if needed, use S3 + Next.js Route Handlers
6. **Email/SMS integrations** — Should be in NestJS backend, not frontend
7. **Analytics data retention** — How long to keep historical data? Affects caching strategy
8. **Multi-tenancy** — Is this single-org or multi-org? Affects auth + data isolation

---

## Summary: Decision Matrix

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Routing** | App Router | Latest, Server Components by default |
| **Data Fetching** | Server Components + fetch | Simple, no extra complexity |
| **Mutations** | Server Actions | Built-in, less boilerplate than REST |
| **Client Data** | Props drilling + Context | Minimal state = faster, simpler |
| **Forms** | React Hook Form + Zod | Lightweight, type-safe, great DX |
| **Tables** | TanStack Table (if 100+ rows) | Headless, customizable, performant |
| **Charts** | Recharts | React-first, easy to use |
| **Auth** | JWT + Proxy + session cookies | Simple, no external dependencies |
| **UI Library** | Tailwind CSS + shadcn/ui | Composable, no bloat |
| **State for Lists** | URL searchParams | Bookmarkable, simple, shareable |

---

## Implementation Priority

1. **Phase 1:** App Router structure, auth (Proxy + JWT), basic list/detail pages
2. **Phase 2:** Forms (React Hook Form + Zod), Server Actions
3. **Phase 3:** Table enhancements (TanStack Table), filters, pagination
4. **Phase 4:** Analytics dashboards, Suspense + streaming
5. **Phase 5:** Polish, performance optimization, E2E testing

