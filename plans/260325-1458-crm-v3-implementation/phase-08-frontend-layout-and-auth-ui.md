---
phase: 8
title: "Frontend Layout & Auth UI"
status: pending
priority: P1
effort: 10h
depends_on: [1, 3]
---

# Phase 08: Frontend Layout & Auth UI

## Context Links

- UI/UX patterns: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 178-198)
- Auth middleware: synthesis (line 109-117)
- Architecture rule: Next.js = pure frontend, all data via NestJS API

## Overview

Set up Next.js 16 App Router with shadcn/ui, Tailwind 4, app shell (sidebar + header + breadcrumbs), auth pages (login), auth middleware, API client utility for calling NestJS backend. Foundation for all frontend pages.

## Requirements

### Functional
- Login page: email + password form, error handling
- App shell: collapsible sidebar, top header with user menu, breadcrumbs
- Auth middleware: redirect unauthenticated users to login
- JWT storage in httpOnly cookies (set by API proxy route)
- Logout: clear tokens, redirect to login
- Sidebar navigation labels in Vietnamese: Trang chủ, Leads, Kho thả nổi, Khách hàng, Đơn hàng, Sản phẩm, Cuộc gọi, Cài đặt, Nhập dữ liệu
- **Kho thả nổi:** visible cho ALL users (leads + customers FLOATING)
- User menu: profile info, logout button
- Role-based nav: Settings visible to manager+, Import to manager+

### Non-Functional
- Server Components by default, Client Components only when needed (forms, interactivity)
- API client handles token refresh automatically
- Loading states with Suspense boundaries
- Responsive sidebar (collapsible on mobile)
- Dark mode support via Tailwind 4
- UI language: Vietnamese only. No i18n framework needed. All labels, buttons, messages in Vietnamese.
- Date format: DD/MM/YYYY (Vietnamese standard)
- Number format: 1.000.000 (dot as thousand separator, comma as decimal)
- Currency: VND (no decimal places for VND display)
- No barrel imports — import each shadcn/ui component from its own file (e.g. `@/components/ui/button`), never create `components/ui/index.ts`
- Lazy load sonner Toaster component with `next/dynamic` (ssr: false)
- Use `React.cache()` for shared data fetched by multiple Server Components (e.g. labels, user info)

## Architecture

### File Structure
```
apps/web/src/
├── app/
│   ├── (auth)/                    # Auth group (no sidebar)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx             # Centered layout
│   ├── (dashboard)/               # Main app group (with sidebar)
│   │   ├── layout.tsx             # App shell: sidebar + header
│   │   ├── page.tsx               # Dashboard home
│   │   ├── leads/
│   │   ├── customers/
│   │   ├── orders/
│   │   ├── products/
│   │   ├── call-logs/
│   │   ├── settings/
│   │   └── import/
│   ├── layout.tsx                 # Root layout (providers)
│   └── not-found.tsx
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx
│   │   ├── header.tsx
│   │   ├── breadcrumbs.tsx
│   │   ├── user-menu.tsx
│   │   └── nav-item.tsx
│   ├── ui/                        # shadcn/ui components
│   └── shared/
│       ├── loading-skeleton.tsx
│       └── error-boundary.tsx
├── lib/
│   ├── api-client.ts              # Fetch wrapper for NestJS API
│   ├── auth.ts                    # Auth helpers (getToken, setToken)
│   ├── cookies.ts                 # Cookie utilities
│   └── utils.ts                   # cn() helper, formatters
├── hooks/
│   ├── use-auth.ts                # Auth context hook
│   └── use-api.ts                 # Data fetching hook
├── providers/
│   ├── auth-provider.tsx          # Auth context + state
│   └── theme-provider.tsx
├── middleware.ts                   # Auth redirect middleware
└── types/
    └── index.ts                   # Frontend-specific types
```

### API Client Pattern
```typescript
// lib/api-client.ts
class ApiClient {
  private baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

  // Server-side: read token from cookies
  async serverFetch<T>(path: string, options?: RequestInit): Promise<T>

  // Client-side: token from cookie automatically sent
  async clientFetch<T>(path: string, options?: RequestInit): Promise<T>

  // Auto-refresh: on 401, attempt refresh, retry original request
  private async handleUnauthorized(): Promise<boolean>
}
// NOTE: Use React.cache() to deduplicate identical server-side fetch calls within same render pass
```

### Auth Flow (Frontend)
```
User visits /leads → middleware checks cookie → no token → redirect /login
User logs in → API returns tokens → set httpOnly cookie via API route
User visits /leads → middleware sees cookie → allow
API call returns 401 → auto-refresh → retry → if fail → redirect /login
```

## Related Code Files

### Create
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/layout.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/page.tsx`
- `apps/web/src/components/layout/app-sidebar.tsx`
- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/components/layout/breadcrumbs.tsx`
- `apps/web/src/components/layout/user-menu.tsx`
- `apps/web/src/components/layout/nav-item.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/cookies.ts`
- `apps/web/src/hooks/use-auth.ts`
- `apps/web/src/providers/auth-provider.tsx`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/api/auth/[...action]/route.ts` — proxy for token cookie management

### Modify
- `apps/web/src/app/layout.tsx` — add providers, fonts, metadata
- `apps/web/tailwind.config.ts` — theme customization if needed

## Implementation Steps

1. **Initialize shadcn/ui**
   - `npx shadcn@latest init` in web app
   - Add components: button, input, card, form, label, separator, sheet, dropdown-menu, avatar, badge, toast (sonner), skeleton
   - Configure Tailwind 4 CSS variables for theming
   - IMPORTANT: Do NOT create barrel file `components/ui/index.ts`. Always import directly: `import { Button } from '@/components/ui/button'`

2. **Create API client**
   - `lib/api-client.ts`: fetch wrapper with base URL, error handling, JSON parsing
   - Server variant: reads token from `cookies()` (Next.js), passes as Authorization header
   - Client variant: relies on httpOnly cookie sent automatically
   - 401 handler: call refresh endpoint, retry, redirect to login on failure

3. **Create auth API route**
   - `app/api/auth/[...action]/route.ts`
   - POST login: proxy to NestJS `/auth/login`, set httpOnly cookies (access_token, refresh_token)
   - POST refresh: proxy to NestJS `/auth/refresh`, update cookies
   - POST logout: clear cookies, proxy to NestJS `/auth/logout`
   - SECURITY: Cookie flags for JWT tokens:
     cookies().set('access_token', token, {
       httpOnly: true,      // prevent XSS access
       secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
       sameSite: 'lax',     // CSRF protection
       path: '/',
       maxAge: 15 * 60,     // 15 minutes (match JWT TTL)
     })
     cookies().set('refresh_token', refreshToken, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'strict',  // stricter for refresh token
       path: '/api/auth',   // only sent to auth endpoints
       maxAge: 7 * 24 * 60 * 60, // 7 days
     })

4. **Create auth middleware**
   - `middleware.ts`: check for `access_token` cookie
   - If missing and path != `/login` → redirect to `/login`
   - If present and path == `/login` → redirect to `/`
   - Matcher: exclude static files, API routes, `_next`

5. **Create auth provider + hook**
   - `auth-provider.tsx`: fetch `/auth/me` on mount, store user in context
   - `use-auth.ts`: expose `user`, `isLoading`, `logout()`
   - Handle loading state (show skeleton while checking auth)
   - Use inline script pattern to prevent hydration flicker: inject auth state as `<script>` in root layout to avoid flash of unauthenticated content

6. **Build app shell**
   - `(dashboard)/layout.tsx`: sidebar + main content area
   - `app-sidebar.tsx`: collapsible, shadcn Sidebar component
   - Navigation items with icons (lucide-react), role-based visibility
   - `header.tsx`: breadcrumbs + user menu
   - `user-menu.tsx`: avatar, name, role, logout button
   - `breadcrumbs.tsx`: auto-generated from pathname

7. **Build login page**
   - `(auth)/login/page.tsx`: centered card, email + password form
   - React Hook Form + Zod validation
   - Error display (wrong credentials, network error)
   - Loading state on submit
   - Redirect to `/` on success
   - SECURITY: Generic error messages only
     - Wrong email: "Invalid credentials" (not "Email not found")
     - Wrong password: "Invalid credentials" (not "Wrong password")
     - Locked account: "Account temporarily locked. Try again in 15 minutes."
     - Never expose stack traces or SQL errors to the client

8. **Add loading + error states**
   - `loading-skeleton.tsx`: reusable skeleton component
   - `error-boundary.tsx`: catches and displays errors gracefully
   - Each major page section should have its own Suspense boundary with dedicated skeleton
   - Dashboard: Suspense per widget (KPI cards, charts, ranking)
   - List pages: filter bar renders immediately, table wrapped in Suspense
   - Detail pages: info panel, timeline, and related data each in separate Suspense

## Todo List

- [ ] Init shadcn/ui + install core components
- [ ] Create API client (server + client variants)
- [ ] Create auth API proxy route (login, refresh, logout)
- [ ] Create auth middleware
- [ ] Create auth provider + use-auth hook
- [ ] Build login page with form validation
- [ ] Build app sidebar with navigation
- [ ] Build header with breadcrumbs + user menu
- [ ] Build dashboard layout (sidebar + content)
- [ ] Add role-based nav item visibility
- [ ] Add loading skeletons + error boundaries
- [ ] Test login flow end-to-end
- [ ] Test token refresh flow
- [ ] Test middleware redirects
- [ ] Set all UI text to Vietnamese
- [ ] Configure date format DD/MM/YYYY
- [ ] Configure number format with Vietnamese separators
- [ ] Verify responsive sidebar on mobile

## Success Criteria

- Login page authenticates against NestJS API
- JWT stored in httpOnly cookie (not localStorage)
- Middleware redirects unauthenticated users to login
- App shell renders with sidebar, header, breadcrumbs
- Sidebar collapses on mobile
- User menu shows profile + logout
- Role-based navigation (settings hidden from regular users)
- API client auto-refreshes token on 401
- Loading skeletons shown during data fetch

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Next.js 16 middleware API changes | Medium | Use stable middleware.ts pattern, check docs |
| Cookie handling cross-origin | Medium | Use API route proxy (same origin), avoid CORS |
| Token refresh race condition | Low | Queue refresh requests, single refresh at a time |
| Hydration mismatch with auth state | Medium | Use loading skeleton until auth resolved |
| Bundle size from UI libraries | Medium | No barrel imports, dynamic import heavy components (charts, kanban), tree-shake unused shadcn components |
| Cookie misconfiguration | High | httpOnly + Secure + SameSite flags on all auth cookies |
| Error message leakage | Medium | Generic "Invalid credentials" for all auth errors |
