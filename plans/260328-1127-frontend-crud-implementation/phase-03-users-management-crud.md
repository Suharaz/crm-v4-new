# Phase 03: Users Management CRUD

## Priority: HIGH
## Status: Pending
## Blocked by: Phase 01

## Overview
Add Users page to sidebar (SUPER_ADMIN only). Full CRUD: list, create, edit, deactivate users.

## API Endpoints
- GET `/users` — list with cursor pagination
- POST `/users` — create (SUPER_ADMIN)
- PATCH `/users/:id` — admin update (SUPER_ADMIN)
- DELETE `/users/:id` — deactivate (SUPER_ADMIN)
- GET `/departments` — for department dropdown
- GET `/employee-levels` — for level dropdown
- GET `/teams?departmentId=X` — for team dropdown

## Implementation

### Navigation
- Add "Quản lý NV" to sidebar nav, after Settings, roles: ['SUPER_ADMIN']

### Pages
1. **app/(dashboard)/users/page.tsx** — SSR list page with table
2. **app/(dashboard)/users/new/page.tsx** — create user form page
3. **app/(dashboard)/users/[id]/edit/page.tsx** — edit user form page

### Components
1. **components/users/user-table.tsx** — table with columns: name, email, role, dept, level, status, actions
2. **components/users/user-form.tsx** — shared create/edit form

### Form Fields (CreateUserDto)
- email* (email input)
- password* (password input, only on create)
- name* (text)
- phone (text)
- role (select: SUPER_ADMIN, MANAGER, USER)
- departmentId (select from departments)
- teamId (select from teams, filtered by dept)
- employeeLevelId (select from levels)

### Form Fields (AdminUpdateUserDto)
- Same as create minus email/password
- + status (select: ACTIVE, INACTIVE)

## Success Criteria
- User list with all columns
- Create new user with all fields
- Edit user (role, dept, team, level, status)
- Deactivate user with confirmation
- Department → Team cascading dropdown
