---
phase: 6
title: "Activity Timeline & Call Integration"
status: pending
priority: P1
effort: 12h
depends_on: [3]
---

# Phase 06: Activity Timeline & Call Integration

## Context Links

- Activity model: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 184-203)
- Call logs model: brainstorm (line 205-229)
- Auto-match logic: brainstorm (line 226-229)

## Overview

Implement polymorphic activity timeline for leads/customers (notes, status changes, assignments, system events). Integrate 3rd party call API with auto-matching by phone number. Unmatched call queue for manual review.

## Requirements

### Functional
- Activity CRUD: create note, list timeline for entity (lead/customer)
- Auto-log activities on: status change, assignment, label change, payment verification (from other modules)
- File attachments on activities (stored on local filesystem)
- Call log ingestion endpoint (3rd party pushes call data)
- Auto-match calls to lead/customer by phone number
- Unmatched call queue: list, manually match
- Call log timeline integration (calls appear in entity timeline)

### Non-Functional
- Activity pagination: cursor-based, ordered by created_at DESC
- Call matching: normalize phone before lookup
- File upload: max 10MB, types: pdf, jpg, png, doc, docx
- API key auth for call ingestion endpoint (separate from JWT)

## Architecture

### Module Structure
```
apps/api/src/modules/
├── activities/
│   ├── activities.module.ts
│   ├── activities.controller.ts
│   ├── activities.service.ts
│   ├── activities.repository.ts
│   └── dto/
│       ├── create-activity.dto.ts
│       └── activity-query.dto.ts
├── call-logs/
│   ├── call-logs.module.ts
│   ├── call-logs.controller.ts
│   ├── call-logs.service.ts
│   ├── call-logs.repository.ts
│   └── dto/
│       ├── ingest-call.dto.ts
│       ├── match-call.dto.ts
│       └── call-query.dto.ts
├── file-upload/
│   ├── file-upload.module.ts
│   ├── file-upload.service.ts   # Local filesystem operations
│   └── file-upload.controller.ts
```

### Call Auto-Match Flow
```
3rd Party API → POST /api/v1/call-logs/ingest (API key auth)
    │
    ▼
Normalize phone_number
    │
    ▼
Search leads WHERE phone = normalized AND deleted_at IS NULL
    │
    ├─ Found → matched_entity_type=LEAD, matched_entity_id=lead.id
    │          matched_user_id=lead.assigned_user_id
    │          match_status=AUTO_MATCHED
    │          Create CALL activity on lead timeline
    │
    └─ Not found → Search customers WHERE phone = normalized
        │
        ├─ Found → matched_entity_type=CUSTOMER, ...
        │
        └─ Not found → match_status=UNMATCHED
                       Added to unmatched queue
```

### API Endpoints

**Activities:**
- `GET /leads/:id/activities` — lead timeline, cursor paginated
- `GET /customers/:id/activities` — customer timeline, cursor paginated
- `POST /leads/:id/activities` — create note on lead
- `POST /customers/:id/activities` — create note on customer
- `POST /activities/:id/attachments` — upload file attachment

**Call Logs:**
- `POST /call-logs/ingest` — ingest call (API key auth, not JWT)
- `GET /call-logs` — list all, filter by match_status/date/phone
- `GET /call-logs/unmatched` — unmatched queue (manager+)
- `POST /call-logs/:id/match` — manually match to entity (manager+)
- `GET /leads/:id/calls` — calls for specific lead
- `GET /customers/:id/calls` — calls for specific customer

**File Upload:**
- `POST /upload` — upload file to local filesystem, returns relative path

**Documents (file attachments for leads/customers):**
- `GET /leads/:id/documents` — list documents for lead
- `GET /customers/:id/documents` — list documents for customer
- `POST /leads/:id/documents` — upload document for lead (any auth user with access)
- `POST /customers/:id/documents` — upload document for customer
- `DELETE /documents/:id` — soft delete document (uploader or manager+)
- Accepted types: .pdf, .doc, .docx, .xls, .xlsx, .jpg, .jpeg, .png, .gif, .webp. Max 10MB.
- Storage path: `uploads/documents/{entityType}/{YYYY-MM}/{uuid}.{ext}`
- SECURITY: Document access inherits entity access check (same as activities)

## Related Code Files

### Create
- `apps/api/src/modules/activities/` — all activity files
- `apps/api/src/modules/call-logs/` — all call-log files
- `apps/api/src/modules/file-upload/` — local filesystem upload service
- `apps/api/src/common/guards/api-key.guard.ts` — API key auth guard

### Modify
- `apps/api/src/app.module.ts` — register modules
- `apps/api/src/modules/leads/leads.service.ts` — inject ActivityService for auto-logging
- `apps/api/src/modules/customers/` — inject ActivityService
- `packages/types/src/` — Activity, CallLog interfaces

## Implementation Steps

1. **Implement FileUpload module (local filesystem)**
   - Storage path: `uploads/{entityType}/{YYYY-MM}/` (organized by type and month)
   - `file-upload.service.ts`:
     - uploadFile(buffer, originalName, mimetype) → saves to local fs, returns relative path
     - Use UUID for stored filename: `{uuid}.{ext}` (never user-supplied name)
     - Validate file size (10MB max) + MIME type via magic bytes
     - For CSV imports: `uploads/imports/{YYYY-MM}/{uuid}.csv`
     - For attachments: `uploads/attachments/{YYYY-MM}/{uuid}.{ext}`
   - Serve files via NestJS ServeStaticModule or custom controller with auth check
   - Pre-signed URLs NOT needed — use authenticated download endpoint instead:
     GET /files/:id → check auth → stream file from disk
   - No MinIO dependency, no S3 SDK needed

2. **Implement Activities module**
   - `activities.repository.ts`: polymorphic query by entity_type + entity_id
   - `activities.service.ts`:
     - `createNote(entityType, entityId, userId, content)` — manual note
     - `logActivity(entityType, entityId, userId, type, content, metadata)` — system auto-log
     - `getTimeline(entityType, entityId, cursor, limit)` — paginated timeline
   - `activities.controller.ts`: REST endpoints nested under leads/customers
   - Attachment upload: link file to activity via activity_attachments table
   - **Export ActivityService** for injection by other modules (leads, payments, etc.)
   - SECURITY: Activity timeline inherits entity access check
     - Before returning activities for lead/customer, verify user has access to that entity
     - Reuse buildAccessFilter from Phase 04
     - GET /leads/:id/activities → first check user can access lead :id → then return activities
     - Do NOT expose a generic GET /activities endpoint (no direct activity table access)

3. **Implement API Key guard**
   - `api-key.guard.ts`: check `X-API-Key` header against ApiKey table from Phase 02
     - Extract key from X-API-Key header
     - Hash with SHA-256
     - Lookup in api_keys table: WHERE keyHash = hash AND isActive = true AND (expiresAt IS NULL OR expiresAt > now())
     - Update lastUsedAt on successful validation
     - Return 401 if not found or expired
     - DO NOT use env var for API keys — use DB-stored hashed keys for proper rotation/revocation
   - Apply to call-logs ingest endpoint only

4. **Implement CallLogs module**
   - `call-logs.service.ts`:
     - `ingestCall(data)`: normalize phone → auto-match → save → create activity if matched
     - `matchCall(callId, entityType, entityId)`: manual match → update record → create activity
     - `getUnmatched(cursor, limit)`: unmatched queue
   - Auto-match: search leads first (by phone, not deleted), then customers
   - If matched to lead with assigned_user_id → set matched_user_id
   - Dedup by external_id (reject if already ingested)
   - DTO validation for ingest-call.dto.ts:
     - external_id: string, required, max 255 chars, sanitize (strip special chars)
     - phone_number: string, required, normalize with phone util
     - call_type: enum (OUTGOING | INCOMING | MISSED), required
     - call_time: ISO date string, required, must not be in the future
     - duration: integer >= 0
     - content: string, optional, max 10000 chars, HTML-sanitize

5. **Wire activity auto-logging into existing modules**
   - Leads: on assign, status change, label change → `activityService.logActivity(...)`
   - Payments: on verify/reject → log on lead timeline
   - This replaces the stubs from phase 04

6. **Test flows**
   - Create note on lead → appears in timeline
   - Upload attachment to note → file on local disk, path in DB
   - Ingest call with known phone → auto-matched, activity created
   - Ingest call with unknown phone → unmatched queue
   - Manually match unmatched call → activity created
   - Dedup: re-ingest same external_id → rejected

## Todo List

- [ ] Implement local filesystem file upload service
- [ ] Implement Activities module (repo, service, controller)
- [ ] Implement activity attachment upload
- [ ] Create API key guard for 3rd party endpoints
- [ ] Implement CallLogs module (repo, service, controller)
- [ ] Implement call auto-match by phone
- [ ] Implement unmatched call queue
- [ ] Implement manual call matching
- [ ] Wire activity auto-logging into leads module
- [ ] Wire activity auto-logging into payments module
- [ ] Implement Documents CRUD (upload, list, delete for leads/customers)
- [ ] Test file upload to local filesystem
- [ ] Test document upload + access control
- [ ] Test call ingestion + auto-match
- [ ] Test unmatched queue + manual match

## Success Criteria

- Notes created and visible in lead/customer timeline
- File attachments uploaded to local filesystem with correct paths
- Call ingested via API key auth (not JWT)
- Auto-match correctly identifies leads/customers by phone
- Unmatched calls appear in queue for manual review
- Manual matching updates call record and creates activity
- Duplicate external_id calls rejected
- Timeline shows all activity types in chronological order

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Disk space exhaustion | Medium | Monitor uploads/ size, set max total storage limit, cleanup old import CSVs after 30 days |
| Call auto-match false positives | Medium | Match by normalized phone, show match confidence in UI |
| High volume call ingestion | Low | Rate limit ingestion endpoint, BullMQ if needed later |
| Activity table growth | Medium | Partition by created_at monthly when >1M rows |
| File path traversal | High | UUID filenames, never use original name in storage path |
| Activity timeline IDOR | Medium | Inherit entity access check before returning activities |
| Call content XSS | Medium | HTML-sanitize content field, escape in frontend display |

## Security Considerations

- API key for call ingestion stored in env, rotatable
- File uploads stored in `uploads/` directory outside web root
- Authenticated download endpoint (not publicly accessible static files)
- UUID filenames prevent path traversal
- File serve endpoint checks user has access to parent entity
- Rate limit on ingestion endpoint: 100 req/min
- Activity timeline access inherits entity RBAC — no direct activity table exposure
- File uploads use UUID filenames, never user-supplied paths
- Call log content HTML-sanitized to prevent XSS in timeline display
- API keys stored hashed in DB (not env vars) for proper rotation/revocation
