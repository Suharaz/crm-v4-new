# Phase 01 - Backend: API trả 5 note + tạo note trong transaction

## Context Links

- Plan: [plan.md](plan.md)
- Permission matrix: `CLAUDE.md` (Project root)
- Activity model: `packages/database/prisma/schema.prisma:650-667`
- Activities service: `apps/api/src/modules/activities/activities.service.ts:90-93` (createNote)
- Leads service: `apps/api/src/modules/leads/leads.service.ts`
- Leads controller: `apps/api/src/modules/leads/leads.controller.ts:106-110` (create endpoint, MANAGER+)

## Overview

- **Priority:** P0 (blocker cho phase 2 + 3)
- **Status:** Completed
- **Description:** Mở rộng API leads để (a) trả về 5 note gần nhất cho mỗi lead trong list, (b) cho phép tạo lead kèm note ban đầu trong cùng transaction.

## Key Insights

- Activity polymorphic không có FK -> Prisma `include` không dùng được trực tiếp
- Cần raw SQL với `ROW_NUMBER() OVER (PARTITION BY entity_id ...)` để lấy top 5 per lead trong 1 query (tránh N+1)
- `createNote` đã tồn tại trong `activities.service.ts` -> reuse trong transaction
- Khi tạo trong transaction, KHÔNG gọi method ngoài Prisma context. Phải dùng `tx.activity.create(...)` trực tiếp hoặc nhận `tx` làm tham số

## Requirements

### Functional

- F1: `GET /leads/*` (mọi endpoint list: pool/new, pool/zoom, my-leads, search, by-label,...) response shape thêm field `recentNotes: Array<{ id: string; content: string; createdAt: string }>` (max 5, sort `createdAt DESC`)
- F2: `POST /leads` chấp nhận field optional `note?: string` (max 2000 ký tự, trim, bỏ qua nếu rỗng sau trim)
- F3: Khi `note` có content, tạo 1 record `activities` với `entityType='LEAD'`, `entityId=newLead.id`, `userId=req.user.id`, `type='NOTE'`, `content=note.trim()` trong cùng transaction
- F4: Nếu tạo activity lỗi -> rollback lead (atomicity)

### Non-functional

- NF1: List endpoint không tăng quá 50ms p95 (đo bằng query log nếu cần)
- NF2: Raw SQL phải dùng `Prisma.sql` / template literal (chống SQL injection)
- NF3: BigInt fields (`id`, `userId`, `entityId`) serialize bằng global interceptor (đã có)

## Architecture

### Flow create lead + note

```
Controller.create(dto, user)
  -> Service.create(dto, user)
     -> prisma.$transaction(async tx => {
          lead = tx.lead.create({...})
          if (dto.note?.trim()) {
            tx.activity.create({
              entityType: 'LEAD', entityId: lead.id,
              userId: user.id, type: 'NOTE',
              content: dto.note.trim()
            })
          }
          return lead
        })
```

### Flow list leads with recentNotes

```
Service.findMany(query, user)
  1. where = buildAccessFilter(user, 'LEAD') + filters
  2. leads = prisma.lead.findMany({ where, take, skip, orderBy, include: { ... } })
  3. if (leads.length === 0) return { data: [] }
  4. leadIds = leads.map(l => l.id)
  5. notes = prisma.$queryRaw<NoteRow[]>`
       SELECT entity_id, id, content, created_at
       FROM (
         SELECT entity_id, id, content, created_at,
                ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC) AS rn
         FROM activities
         WHERE entity_type = 'LEAD'
           AND entity_id IN (${Prisma.join(leadIds)})
           AND type = 'NOTE'
           AND deleted_at IS NULL
       ) t
       WHERE rn <= 5
       ORDER BY entity_id, created_at DESC
     `
  6. group notes by entity_id
  7. attach to lead: lead.recentNotes = notesByLeadId[lead.id] ?? []
```

## Related Code Files

### Read (for context)
- `apps/api/src/modules/leads/leads.service.ts` (existing query patterns)
- `apps/api/src/modules/leads/leads.controller.ts:106-110`
- `apps/api/src/modules/leads/leads.repository.ts` (if exists)
- `apps/api/src/modules/activities/activities.service.ts:90-93`
- `apps/api/src/common/filters/build-access-filter.ts:26`
- `packages/database/prisma/schema.prisma:650-667` (Activity model)
- `packages/types/src/lead.ts` (Lead response type)
- `apps/api/src/modules/leads/dto/create-lead.dto.ts` (existing fields)

### Modify
- `apps/api/src/modules/leads/dto/create-lead.dto.ts` - add `note?: string` (IsString, IsOptional, MaxLength 2000)
- `apps/api/src/modules/leads/leads.service.ts` - wrap `create` in transaction + add note insert; modify list methods to attach `recentNotes`
- `apps/api/src/modules/leads/leads.repository.ts` (if exists) - new method `findRecentNotesForLeads(leadIds: bigint[]): Promise<Map<bigint, NoteRow[]>>`
- `packages/types/src/lead.ts` - extend `LeadListItem` with `recentNotes: NoteSummary[]`

### Create
- `apps/api/src/modules/leads/helpers/attach-recent-notes.ts` (nếu cần tách logic gom notes) - OPTIONAL, chỉ tạo nếu service file vượt 200 LOC

### Delete
- None

## Implementation Steps

1. **Read** tất cả file trong "Read (for context)" để hiểu pattern hiện tại
2. Cập nhật `create-lead.dto.ts`: thêm `@IsOptional() @IsString() @MaxLength(2000) note?: string;`
3. Cập nhật `packages/types/src/lead.ts`:
   ```ts
   export interface LeadNoteSummary {
     id: string;
     content: string;
     createdAt: string;
   }
   // Add to LeadListItem:
   recentNotes: LeadNoteSummary[];
   ```
4. Trong `leads.service.ts.create()`: wrap thân function trong `this.prisma.$transaction(async tx => { ... })`. Sau khi `tx.lead.create(...)`, check `dto.note?.trim()` -> nếu có gọi `tx.activity.create({ entityType: 'LEAD', entityId: lead.id, userId: BigInt(user.id), type: 'NOTE', content: dto.note.trim() })`
5. Tạo helper `findRecentNotesForLeads(leadIds)` trong repository hoặc inline trong service:
   - Nếu `leadIds.length === 0` return `new Map()`
   - Dùng `prisma.$queryRaw` với SQL như trong Architecture
   - Trả `Map<string, NoteSummary[]>` (key = BigInt toString)
6. Trong tất cả method list (`findMany`, `poolNewFiltered`, `poolZoom`, `myLeads`, ...): sau khi có `leads`, gọi helper, gắn `recentNotes` cho từng lead. **DRY:** dùng 1 utility function `attachRecentNotes(leads)` để tránh lặp
7. Verify BigInt serialization: response phải có `recentNotes[].id` là string. Global interceptor đã handle BigInt -> kiểm tra response bằng `curl` hoặc thunder client
8. Chạy `pnpm build` trong `apps/api` -> không có TS error
9. Test manual:
   - POST `/leads` với body `{ phone: '0123456789', name: 'Test', note: 'Khách hẹn gọi lại 3h' }` -> kiểm tra DB có lead + activity
   - POST `/leads` với note rỗng `""` -> chỉ tạo lead, không activity
   - POST `/leads` không có note -> chỉ tạo lead
   - GET `/leads/pool/new` -> response items có `recentNotes`
   - Tạo 7 note cho 1 lead -> GET list trả đúng 5 mới nhất

## Todo List

- [x] Read context files (8 file)
- [x] Update `create-lead.dto.ts` thêm `note`
- [x] Update `packages/types/src/lead.ts` thêm `LeadNoteSummary` + `recentNotes`
- [x] Wrap `leads.service.create()` trong transaction + insert activity nếu có note
- [x] Implement `findRecentNotesForLeads` helper với raw SQL ROW_NUMBER
- [x] Gắn `recentNotes` vào response của TẤT CẢ list endpoints
- [x] Build `pnpm build` trong `apps/api` không có TS error
- [x] Manual test 5 case (curl/thunder)
- [x] `pnpm test` ở `apps/api` không break test cũ
- [x] `code-reviewer` review

## Success Criteria

- POST /leads với note tạo đúng 1 lead + 1 activity trong cùng transaction
- POST /leads không note hoặc note rỗng KHÔNG tạo activity
- GET /leads/* response item có `recentNotes` array, max 5, sort DESC theo `createdAt`
- Lead không có note nào -> `recentNotes: []` (không null/undefined)
- Khi 100 leads * 5 notes -> chỉ 2 query DB (1 leads + 1 notes)
- Tất cả test cũ pass, không regression

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Raw SQL ROW_NUMBER chạy chậm với bảng `activities` lớn | High | Index `[entityType, entityId, createdAt]` đã có (schema.prisma). Verify bằng `EXPLAIN ANALYZE` nếu nghi |
| Quên scope notes theo access filter | Medium | Notes đã filter theo `lead.id IN (leadIds)`, mà `leadIds` từ leads đã `buildAccessFilter` -> auto-scoped |
| Transaction timeout khi note insert chậm | Low | Default 5s transaction timeout đủ. Note insert là 1 row trivial |
| BigInt serialize sai trong response | Low | Test với curl, kiểm tra response thực tế |
| `tx.activity.create` vs `activitiesService.createNote` | Low | Dùng `tx.activity.create` trực tiếp để không phụ thuộc service khác. createNote ngoài tx có thể không hooks vào tx |

## Security Considerations

- Note content KHÔNG được render HTML thô ở frontend (sẽ là XSS) -> frontend dùng React text node, không `dangerouslySetInnerHTML`
- Note 2000 ký tự max -> tránh abuse storage. Đã limit ở DTO
- Author note = `req.user.id` (server-side trust, KHÔNG nhận từ body)
- Access filter scope notes qua leads -> USER không thấy note của lead người khác

## Skills to Activate

- `nestjs-expert` - DTO + transaction patterns
- `postgres-pro` - raw SQL window function
- `databases` - Prisma raw query + BigInt handling
- `sequential-thinking` - logic raw SQL + group by client-side

## Next Steps

Sau khi phase 1 done:
- Trigger phase 2 (frontend cột Note + label dưới SĐT)
- Trigger phase 3 (frontend popup note field)
- Phase 4 (source combobox) độc lập với phase 1, có thể chạy parallel ngay từ đầu
