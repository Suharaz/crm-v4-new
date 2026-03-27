---
phase: 7
title: "Data Import & Third-Party API"
status: pending
priority: P1
effort: 10h
depends_on: [4]
---

# Phase 07: Data Import & Third-Party API

## Context Links

- CSV import pipeline: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 263-269)
- Import size target: brainstorm (line 362) — 10K+ rows
- BullMQ for background jobs: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 33)

## Overview

CSV lead/customer import via BullMQ background jobs (handle 10K+ rows), 3rd party lead ingestion API (API key auth), and CSV export for lists. Manager+ permission for imports.

## Requirements

### Functional
- CSV upload: leads and customers (separate templates)
- Background processing via BullMQ (chunked, progress tracking)
- Validation: required fields, phone format, dedup check per row
- Import results: success count, error rows with reasons, downloadable error report
- 3rd party lead API: POST endpoint with API key auth for external systems to push leads
- CSV export: leads list, customers list, orders list (with current filters)

### Non-Functional
- Handle 10K+ rows without timeout (background job)
- Memory-efficient: stream CSV parsing (csv-parse)
- Import progress trackable via polling endpoint
- Rate limit on 3rd party API: 100 req/min per API key (using @nestjs/throttler with API key as identifier)
- Separate throttle config from authenticated user endpoints

## Architecture

### Module Structure
```
apps/api/src/modules/
├── import/
│   ├── import.module.ts
│   ├── import.controller.ts
│   ├── import.service.ts
│   ├── import.processor.ts      # BullMQ processor
│   ├── import.repository.ts
│   └── dto/
│       ├── import-upload.dto.ts
│       └── import-status.dto.ts
├── export/
│   ├── export.module.ts
│   ├── export.controller.ts
│   └── export.service.ts
├── third-party-api/
│   ├── third-party-api.module.ts
│   ├── third-party-api.controller.ts
│   ├── third-party-api.service.ts
│   └── dto/
│       └── external-lead.dto.ts
```

### Import Flow
```
Upload CSV → Validate file type/size → Store in uploads/imports/
    │
    ▼
Create import job record (status=PROCESSING)
    │
    ▼
Add to BullMQ queue "import"
    │
    ▼
Processor picks up job:
├── Stream-parse CSV rows
├── For each row:
│   ├── Validate required fields (phone, name)
│   ├── Normalize phone
│   ├── Dedup check (phone + source)
│   ├── Create lead/customer or add to errors
│   └── Update progress (every 100 rows)
└── Complete: update import record with results
    │
    ▼
Frontend polls GET /imports/:id/status
```

### API Key Authentication
- API keys stored as SHA-256 hash in `api_keys` table (created in Phase 02)
- 3rd party sends key via `X-API-Key` header
- Guard: ApiKeyGuard extracts header → hash → lookup in DB → validate isActive + not expired
- SECURITY: API key validation MUST check:
  1. keyHash matches
  2. isActive === true
  3. expiresAt is null OR expiresAt > now()
  If any check fails → 401 Unauthorized

  Guard implementation:
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash: hash(providedKey),
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    }
  })
- Log lastUsedAt on each successful request
- Super admin manages keys via settings UI (Phase 10)
- Key format: `crm_` prefix + 32 random chars (e.g. crm_a1b2c3d4...)
- On creation: show full key ONCE, store only hash

### Import Record Table (add to Prisma schema)
```prisma
model ImportJob {
  id            BigInt    @id @default(autoincrement())
  type          String    // "leads" | "customers"
  fileName      String    @map("file_name")
  fileUrl       String    @map("file_url")   // relative path to uploaded CSV file
  status        ImportStatus @default(PROCESSING)
  totalRows     Int       @default(0) @map("total_rows")
  successCount  Int       @default(0) @map("success_count")
  errorCount    Int       @default(0) @map("error_count")
  errorFileUrl  String?   @map("error_file_url") // relative path to error report CSV
  createdBy     BigInt    @map("created_by")
  createdAt     DateTime  @default(now()) @map("created_at")
  completedAt   DateTime? @map("completed_at")
  user          User      @relation(fields: [createdBy], references: [id])
  @@map("import_jobs")
}
```
Add ImportStatus enum: PROCESSING | COMPLETED | FAILED to Phase 02 schema

### API Endpoints

**Import:**
- `POST /imports/leads` — upload CSV for lead import (manager+)
- `POST /imports/customers` — upload CSV for customer import (manager+)
- `GET /imports` — list import jobs, cursor paginated
- `GET /imports/:id/status` — import progress/results
- `GET /imports/templates/leads` — download CSV template
- `GET /imports/templates/customers` — download CSV template

**Export:**
- `GET /exports/leads` — export leads CSV (with current query filters)
- `GET /exports/customers` — export customers CSV
- `GET /exports/orders` — export orders CSV

**Third-Party API:**
- `POST /external/leads` — create lead from external system (API key auth)

## Related Code Files

### Create
- `apps/api/src/modules/import/` — all import files
- `apps/api/src/modules/export/` — all export files
- `apps/api/src/modules/third-party-api/` — external lead API

### Modify
- `packages/database/prisma/schema.prisma` — add ImportJob model
- `apps/api/src/app.module.ts` — register modules + BullMQ
- `docker-compose.yml` — add Redis service (for BullMQ)

## Implementation Steps

1. **Add Redis to Docker Compose**
   - Redis 7 service on port 6379
   - Configure BullMQ in NestJS: `@nestjs/bullmq` package
   - Register BullModule in AppModule with Redis connection

2. **Add ImportJob model to Prisma schema** + migrate

3. **Implement Import module**
   - File validation security:
     - Max file size: 10MB (configured in Multer)
     - MIME type: only text/csv or application/csv
     - Filename sanitization: strip path separators, special chars
     - Reject files with BOM that isn't UTF-8
     @UseInterceptors(FileInterceptor('file', {
       limits: { fileSize: 10 * 1024 * 1024 },
       fileFilter: (req, file, cb) => {
         if (!file.originalname.endsWith('.csv')) {
           return cb(new BadRequestException('Only CSV files allowed'), false)
         }
         cb(null, true)
       }
     }))
   - `import.controller.ts`: file upload endpoint (multer), validate CSV, store in uploads/imports/, enqueue job
   - `import.service.ts`: create import record, enqueue BullMQ job, get status
   - `import.processor.ts` (BullMQ worker):
     - Read CSV from uploads/imports/
     - Stream-parse with `csv-parse` (avoid loading entire file in memory)
     - Process in chunks of 100 rows
     - Per row: validate → normalize phone → dedup → create via leads/customers service
     - Track errors: `{ row, field, message }`
     - On complete: generate error CSV → save to uploads/imports/errors/ → update import record
     - Update progress every 100 rows

4. **Implement CSV templates**
   - Lead template: name, phone, email, source (name), product (name), notes
   - Customer template: name, phone, email, notes
   - Return as downloadable CSV with headers only

5. **Implement Export module**
   - `export.service.ts`: query with filters → stream to CSV → return as download
   - Accept same query params as list endpoints
   - Use `csv-stringify` for CSV generation
   - Set `Content-Disposition: attachment; filename="leads-export-{date}.csv"`
   - SECURITY: Sanitize ALL cell values before writing to CSV
     - Use csv-sanitizer utility from packages/utils
     - Prefix dangerous characters (= + - @ |) to prevent formula injection when opened in Excel
     - Apply to: lead export, customer export, order export, error report CSV

6. **Implement Third-Party API module**
   - `POST /external/leads` with API key auth (reuse guard from phase 06)
   - Accept: name, phone, email, source (string), metadata (json)
   - Normalize phone → find/create source → create lead via leads service
   - Return: created lead ID, dedup status

7. **Test imports**
   - Upload 100-row CSV → verify background processing, progress, results
   - Upload CSV with errors → verify error report generated
   - Upload duplicate phones → verify dedup handling
   - Test export with filters → verify CSV content matches

## Todo List

- [ ] Add Redis to docker-compose.yml
- [ ] Install + configure @nestjs/bullmq
- [ ] Add ImportJob model to Prisma schema + migrate
- [ ] Implement import upload endpoint (leads + customers)
- [ ] Implement BullMQ import processor (stream CSV parsing)
- [ ] Implement import progress/status polling endpoint
- [ ] Implement error report generation (CSV)
- [ ] Create CSV templates for leads and customers
- [ ] Implement export endpoints (leads, customers, orders)
- [ ] Implement third-party lead ingestion API
- [ ] Test 10K row import performance
- [ ] Test dedup during import
- [ ] Test export with various filters

## Success Criteria

- CSV import processes 10K rows without timeout or memory issues
- Import progress trackable via polling endpoint
- Error rows collected with clear reasons, downloadable as CSV
- Phone normalization + dedup applied during import
- Export generates valid CSV matching current filter state
- Third-party API creates leads with API key auth
- Duplicate external leads handled gracefully

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Memory spike on large CSV | High | Stream parsing (csv-parse), chunk processing |
| Redis connection failure | Medium | Health check, retry policy, fallback error message |
| Import job stuck/hanging | Medium | BullMQ job timeout (5 min), retry policy (3 attempts) |
| CSV encoding issues (UTF-8 BOM) | Low | Strip BOM on parse, handle common encodings |
| API key leak/abuse | High | Hash keys in DB, rate limit per key, expiration dates, revocation via settings |
| Path traversal in filename | Medium | Sanitize uploaded filenames, use UUID for stored file names in uploads/ |
| CSV formula injection on export | High | Sanitize all cell values with csv-sanitizer utility before CSV generation |
| API key used after expiration | High | Validate expiresAt in ApiKeyGuard on every request |
