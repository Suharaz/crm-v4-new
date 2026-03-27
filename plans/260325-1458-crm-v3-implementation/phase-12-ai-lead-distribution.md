---
phase: 12
title: "AI Lead Distribution"
status: pending
priority: P2
effort: 8h
depends_on: [4, 11]
---

# Phase 12: AI Lead Distribution

## Context Links

- AI config model: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 249-257)
- Approach: brainstorm (line 333) — weighted scoring first, NOT LLM
- Risk: brainstorm (line 325)

## Overview

Implement weighted scoring algorithm for automatic lead distribution. NOT ML/LLM — rule-based scoring using: workload (30%), employee level (30%), historical conversion rate (40%). Configurable per department. Includes config UI for super_admin.

## Requirements

### Functional
- Auto-assign leads from pool based on weighted score
- Scoring factors: current workload, employee level rank, historical conversion rate
- Weight configuration per department (default: workload 30%, level 30%, performance 40%)
- Config UI: super_admin can view/edit weights per department, toggle on/off
- Manual override: manager can still manually assign (bypassing auto-distribution)
- Distribution trigger: on lead creation (if auto-distribution enabled for department) OR batch distribute from pool
- Distribution log: record why a lead was assigned to specific user (score breakdown)

### Non-Functional
- Scoring must complete in <500ms per lead
- Fair distribution: no user gets >2x average workload
- Configurable max leads per user (cap)

## Architecture

### Module Structure
```
apps/api/src/modules/
├── distribution/
│   ├── distribution.module.ts
│   ├── distribution.controller.ts
│   ├── distribution.service.ts
│   ├── distribution.repository.ts
│   ├── scoring.service.ts          # Core scoring algorithm
│   └── dto/
│       ├── distribution-config.dto.ts
│       ├── distribute-lead.dto.ts
│       └── scoring-result.dto.ts
```

### Scoring Algorithm
```
For each eligible user in department:

workload_score = 1 - (active_leads_count / max_leads_cap)      // 0-1, lower workload = higher score
level_score    = user.employee_level.rank / max_rank            // 0-1, higher rank = higher score
perf_score     = user.conversion_rate_30d                       // 0-1, historical conversion rate

total_score = (workload_score * weight_workload)
            + (level_score * weight_level)
            + (perf_score * weight_performance)

Assign to user with highest total_score
```

### Config Table (from brainstorm)
```prisma
model AiDistributionConfig {
  id                BigInt   @id @default(autoincrement())
  departmentId      BigInt   @unique @map("department_id")
  isActive          Boolean  @default(false) @map("is_active")
  matchingCriteria  Json?    @map("matching_criteria")  // future: source-based routing
  weightConfig      Json     @map("weight_config")      // {workload: 0.3, level: 0.3, performance: 0.4}
  maxLeadsPerUser   Int      @default(50) @map("max_leads_per_user")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  department        Department @relation(fields: [departmentId], references: [id])
  @@map("ai_distribution_configs")
}
```

### API Endpoints

**AI Distribution Config:**
- `GET /distribution/config` — list configs for all departments (super_admin)
- `GET /distribution/config/:departmentId` — get config for department
- `PUT /distribution/config/:departmentId` — create/update config (super_admin)
- `POST /distribution/distribute` — distribute single lead `{ leadId }` (manager+)
- `POST /distribution/distribute-batch` — distribute all pool leads for department (manager+)
- `GET /distribution/preview/:leadId` — preview scoring for a lead (show all user scores without assigning)

**Assignment Templates (phân phối theo template):**
- `GET /assignment-templates` — list templates (manager+)
- `POST /assignment-templates` — create template (manager+)
  Body: `{ name, strategy: "ROUND_ROBIN"|"AI_WEIGHTED", memberUserIds: [1,2,3] }`
  → Chọn danh sách người CỤ THỂ khi tạo template
- `PATCH /assignment-templates/:id` — update (name, strategy, members)
- `DELETE /assignment-templates/:id` — deactivate
- `POST /assignment-templates/:id/apply` — apply lên danh sách leads (manager+)
  Body: `{ leadIds: [1,2,3,4,5,6,7] }`
  → Validation: chỉ apply lên leads có status POOL hoặc FLOATING. Skip leads đã ASSIGNED/IN_PROGRESS/CONVERTED/LOST → trả về danh sách skipped cho manager
  → ROUND_ROBIN: vòng lặp — 7 leads / 3 người → A(1,4,7), B(2,5), C(3,6)
    Không bắt buộc chia hết, vòng lặp cho đến khi hết lead
  → AI_WEIGHTED: dùng scoring, người điểm cao nhận nhiều hơn
  → Mỗi lead: status=ASSIGNED, dept=member's dept, user=member
  → Response: `{ assigned: [...], skipped: [...], reason: "status not POOL/FLOATING" }`

**Recall Config (super_admin):**
- `GET /recall-configs` — list configs
- `POST /recall-configs` — create `{ entityType, maxDaysInPool, autoLabelIds }`
- `PATCH /recall-configs/:id` — update
- Cron `@Cron('0 1 * * *')`: tìm leads/customers trong dept pool quá X ngày → status=FLOATING, dept=null, user=null, gắn labels

### Frontend
```
apps/web/src/app/(dashboard)/settings/distribution/
└── page.tsx

apps/web/src/components/settings/
├── distribution-config-form.tsx    # Weight sliders + toggle
└── distribution-preview.tsx        # Score breakdown table
```

## Related Code Files

### Create
- `apps/api/src/modules/distribution/` — all distribution files
- `apps/web/src/app/(dashboard)/settings/distribution/page.tsx`
- `apps/web/src/components/settings/distribution-config-form.tsx`
- `apps/web/src/components/settings/distribution-preview.tsx`

### Modify
- `apps/api/src/modules/leads/leads.service.ts` — optional auto-distribute on lead create
- `apps/api/src/app.module.ts` — register distribution module
- `apps/web/src/components/settings/settings-nav.tsx` — add distribution link

## Implementation Steps

1. **Implement scoring service**
   - `scoring.service.ts`:
     - `calculateScore(userId, departmentConfig)`: compute individual user score
     - `rankUsers(departmentId)`: score all eligible users, return sorted
   - Query active leads count per user (workload)
   - Query conversion rate last 30 days per user (performance)
   - Get employee level rank (level)
   - Normalize each factor to 0-1 range

2. **Implement distribution service**
   - `distribution.service.ts`:
     - `distributeLead(leadId)`: score users → assign to highest → log assignment + score breakdown
     - `distributeBatch(departmentId)`: get all pool leads → distribute each
     - `previewDistribution(leadId)`: return scores without assigning
   - Store score breakdown in assignment_history.reason (JSON string)
   - Handle edge cases: no eligible users, all users at capacity, tie-breaking

3. **Implement distribution config CRUD**
   - `distribution.controller.ts`: GET/PUT config endpoints
   - `distribution.repository.ts`: Prisma queries for config

4. **Integrate with lead creation**
   - In `leads.service.ts` create method:
     - After creating lead → check if department has active distribution config
     - If yes → auto-distribute (assign via scoring)
     - If no → leave in pool (default behavior)

5. **Build config UI**
   - `distribution-config-form.tsx`:
     - Toggle: enable/disable auto-distribution
     - Sliders: workload weight, level weight, performance weight (must sum to 1.0)
     - Max leads per user input
     - Save button
   - Per-department configuration

6. **Build distribution preview**
   - `distribution-preview.tsx`:
     - Table showing each eligible user with score breakdown
     - Highlight recommended user (highest score)
     - Useful for managers reviewing before manual assign

7. **Test scoring accuracy**
   - Seed data with known workload/level/performance values
   - Verify scoring produces expected rankings
   - Test edge cases: new user (no history), user at capacity, single eligible user

## Todo List

- [ ] Implement scoring service (workload, level, performance factors)
- [ ] Implement distribution service (single + batch)
- [ ] Implement distribution preview endpoint
- [ ] Implement distribution config CRUD
- [ ] Integrate auto-distribute on lead creation (optional)
- [ ] Build config UI with weight sliders
- [ ] Build distribution preview table
- [ ] Add distribution link to settings nav
- [ ] Test scoring with seed data
- [ ] Test batch distribution
- [ ] Test edge cases (no users, at capacity, ties)
- [ ] Implement AssignmentTemplate CRUD
- [ ] Implement template apply endpoint (round-robin + AI_WEIGHTED)
- [ ] Implement RecallConfig CRUD (super_admin)
- [ ] Implement auto-recall cron (daily 1 AM, move to FLOATING + auto labels)
- [ ] Test template apply: round-robin distributes evenly
- [ ] Test auto-recall: lead in dept pool > X days → FLOATING

## Success Criteria

- Scoring produces deterministic, correct rankings based on weights
- Auto-distribution assigns leads to highest-scoring user
- Config UI allows weight adjustment (validates sum = 1.0)
- Batch distribute processes all pool leads for department
- Preview shows score breakdown without assigning
- Score breakdown logged in assignment history
- Manual assign still works (bypasses scoring)
- Performance: <500ms per lead scoring

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Unfair distribution (bias) | High | Log all scores, admin review, cap per user |
| Performance data insufficient | Medium | Default to equal distribution for new users (<30 days) |
| Weight sum validation | Low | Validate sum = 1.0 on save, normalize if needed |
| Conversion rate gaming | Low | Use 30d rolling window, minimum sample size (5 leads) |
