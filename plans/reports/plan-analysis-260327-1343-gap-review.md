# Plan Gap Analysis: CRM V3 Implementation

**Date:** 2026-03-27 | **Plan:** `260325-1458-crm-v3-implementation`
**Verdict:** Plan is **solid and well-structured** (8/10). Found **16 gaps** — 5 critical, 6 medium, 5 low.

---

## CRITICAL GAPS (Must fix before implementation)

### 1. MinIO vs Local Filesystem — Contradictory Decision
- **Brainstorm** (line 31, 343): MinIO for file storage
- **Research synthesis** (line 32): "File Storage: MinIO (S3-compatible)"
- **Phase 01** (line 30): "No MinIO/S3 needed — local filesystem"
- **Phase 14** (line 104): docker-compose.prod.yml STILL lists `minio` service
- **Phase 14** (line 160): health check mentions "MinIO status"

**Impact:** Confusion during implementation. Phase 14 contradicts Phase 01/06.
**Fix:** Remove MinIO references from Phase 14 OR revert to MinIO. Pick ONE and update all phases.

### 2. Team CRUD Endpoints — Completely Missing
- Phase 02 defines `Team` model with leader, members, department relations
- NO phase implements Team CRUD API endpoints
- Phase 10 Settings pages don't include Team management
- Users have `teamId` FK but no way to create/manage teams

**Impact:** Teams exist in schema but are unusable. Can't assign users to teams, can't set team leaders.
**Fix:** Add Team CRUD to Phase 03 (alongside Users/Departments) or Phase 10 Settings.

### 3. Manager-Department Assignment CRUD — Missing
- Phase 02 defines `ManagerDepartment` junction table
- NO phase implements endpoints for this many-to-many relationship
- Phase 04 uses `user.managedDeptIds` in buildAccessFilter — but how are these set?

**Impact:** Managers can't be assigned to departments. RBAC depends on this relationship existing.
**Fix:** Add `POST/DELETE /users/:id/managed-departments` to Phase 03 Users module (super_admin only). Add UI in Phase 10 Settings > Users.

### 4. Lead Department Scope — Undefined
- Leads have `assigned_user_id` but NO `department_id` column
- Pool endpoint (Phase 04): "filtered by manager's department" — but leads don't have department
- When lead status=POOL and assigned_user_id=null, which department's pool is it in?
- Implicit via `lead.customer.assigned_department_id`? Via creating manager's dept? Ambiguous.

**Impact:** Pool filtering breaks for unassigned leads. Core CRM feature.
**Fix:** Either:
  - (A) Add `department_id` to leads table (explicit, simpler queries)
  - (B) Use `lead.customer.assigned_department_id` (implicit, complex JOINs)
  - Recommend (A) for query simplicity. Document the decision.

### 5. API Key Management UI — Missing from Settings
- Phase 02 defines `ApiKey` model
- Phase 06/07 use API key auth for call ingestion + 3rd party API
- Phase 10 mentions "Super admin manages keys via settings UI" but settings pages list 7 entities — API keys NOT included

**Impact:** No way to create/revoke API keys via UI. Super admin must use DB directly.
**Fix:** Add API Key management page to Phase 10 Settings. Show key ONCE on creation, list keys with prefix + last used.

---

## MEDIUM GAPS (Should fix, not blocking)

### 6. Documents Module — Defined but Not Implemented
- Phase 02 step 6b defines `Document` model (files for leads/customers)
- NO phase implements Document CRUD endpoints
- Phase 06 has `ActivityAttachment` (files on activities) and `FileUpload` service
- But direct document uploads for leads/customers (PDFs, contracts) have no endpoints

**Fix:** Add document upload/list/delete endpoints in Phase 06 (alongside file-upload module). Add document tab to lead/customer detail page in Phase 09.

### 7. ProductCategory CRUD — Missing
- Phase 02 step 4b defines `ProductCategory` model
- Phase 05 Products module doesn't mention category CRUD
- Phase 10 Settings > Products doesn't include category management

**Fix:** Add ProductCategory CRUD to Phase 05 or Phase 10 Settings.

### 8. Account Lockout Fields — Missing from Schema Phase
- Phase 03 Security section: "Add to User model: failedLoginCount, lockedUntil"
- Phase 02 User model schema doesn't include these fields
- Implementation will miss this if Phase 02 is done before reading Phase 03

**Fix:** Add `failedLoginCount Int @default(0) @map("failed_login_count")` and `lockedUntil DateTime? @map("locked_until")` to Phase 02 User model definition.

### 9. CI/CD Pipeline — Not Defined
- Phase 14 has Docker builds and deploy scripts but NO CI/CD pipeline
- No GitHub Actions workflow for: lint, test, build on PR
- For 99.5% uptime target, automated testing before deploy is essential

**Fix:** Add CI/CD to Phase 14:
  - GitHub Actions: lint → test → build on PR
  - Deploy trigger: merge to main → build images → deploy
  - Optionally a separate phase before 14

### 10. Monitoring/Alerting — Missing
- Health check endpoint exists (Phase 14)
- No monitoring stack to consume it
- 99.5% uptime target requires monitoring

**Fix:** Add to Phase 14: basic monitoring with uptime checks (UptimeRobot or similar), PG connection monitoring, Redis health. Full Prometheus/Grafana can defer to post-launch.

### 11. CSV Export Sanitization — Inconsistent
- Phase 07 explicitly applies CSV formula injection sanitization on exports
- Phase 11 analytics CSV export endpoint doesn't mention sanitization
- Any CSV export opened in Excel is vulnerable

**Fix:** Add note to Phase 11 step 10: "Apply csv-sanitizer utility from packages/utils to ALL exported CSV cells."

---

## LOW GAPS (Nice to fix, won't break anything)

### 12. Timezone Strategy — Implicit
- Phase 11 risk assessment mentions "Store UTC, display in user's timezone"
- No explicit timezone strategy defined system-wide
- Vietnamese users likely all UTC+7, but server should store UTC

**Fix:** Add architecture rule: "All timestamps stored as UTC. Frontend displays in Asia/Ho_Chi_Minh. Use dayjs or date-fns-tz."

### 13. Data Migration from CRM v1/v2 — Not Mentioned
- Project is "CRM v3" — presumably v1/v2 data exists
- No data migration plan from previous versions
- May not be needed if fresh start, but should be explicitly stated

**Fix:** Add to plan.md Unresolved Questions: "Data migration from previous CRM versions — TBD (fresh start vs migration)."

### 14. Notification Cleanup — No Strategy
- Phase 13 Notification model has no TTL/cleanup
- Over months, notifications table will grow large
- Phase 03 has refresh token cleanup cron — same pattern needed

**Fix:** Add cleanup cron to Phase 13: delete read notifications older than 90 days, delete all notifications older than 180 days.

### 15. Redis Backup — Missing
- Phase 14 has PG backup strategy
- BullMQ uses Redis for job queue
- Redis data loss = lost import job state (low impact but annoying)

**Fix:** Add note to Phase 14: "Redis: enable AOF persistence in docker-compose.prod.yml. Job queue data is ephemeral — no dedicated backup needed, but AOF prevents data loss on restart."

### 16. Unresolved Questions from Research — Not All Answered
Research synthesis listed 5 "Must Answer" questions:
1. Phone format ✅ Answered (VN 10-11 digits)
2. Lead dedup strategy ✅ Partially (phone + source for leads, phone for customers, email not addressed)
3. Audit trail depth ❌ Not explicitly decided (implicit: action-level from Activity model)
4. Export formats ❌ Not explicitly decided (implicit: CSV only)
5. File upload limits ✅ Answered (10MB, specific types)

**Fix:** Add explicit answers to plan.md Unresolved Questions or a new "Decisions" section.

---

## SUMMARY TABLE

| # | Gap | Severity | Phase(s) Affected |
|---|-----|----------|-------------------|
| 1 | MinIO vs filesystem contradiction | CRITICAL | 01, 06, 14 |
| 2 | Team CRUD missing | CRITICAL | 02, 03, 10 |
| 3 | Manager-Dept assignment CRUD missing | CRITICAL | 02, 03, 04, 10 |
| 4 | Lead department scope undefined | CRITICAL | 02, 04, 09 |
| 5 | API Key management UI missing | CRITICAL | 07, 10 |
| 6 | Documents endpoints missing | MEDIUM | 02, 06, 09 |
| 7 | ProductCategory CRUD missing | MEDIUM | 02, 05, 10 |
| 8 | Account lockout fields missing from schema | MEDIUM | 02, 03 |
| 9 | CI/CD pipeline not defined | MEDIUM | 14 |
| 10 | Monitoring/alerting missing | MEDIUM | 14 |
| 11 | CSV export sanitization inconsistent | MEDIUM | 07, 11 |
| 12 | Timezone strategy implicit | LOW | All |
| 13 | Data migration plan absent | LOW | Plan |
| 14 | Notification cleanup missing | LOW | 13 |
| 15 | Redis backup strategy missing | LOW | 14 |
| 16 | Research questions not all answered | LOW | Plan |

---

## WHAT THE PLAN DOES WELL

- **Security**: Comprehensive — IDOR prevention, CSRF, XSS, SQL injection, rate limiting, formula injection, lockout
- **Architecture**: Clean module separation, proper layering (controller → service → repository)
- **Data model**: BIGINT PKs, soft delete, partial indexes, full-text search — all well-thought
- **Frontend**: Good streaming SSR pattern, Suspense boundaries, optimistic updates
- **Business logic**: Lead lifecycle state machine, payment → conversion trigger, claim race condition handling
- **Phase dependencies**: Clearly mapped, parallelizable where possible
- **Risk assessments**: Each phase has specific risks with mitigations
