# Phase Implementation Report

### Executed Phase
- Phase: unit-tests-business-logic
- Plan: none (direct task)
- Status: completed

### Files Modified
All new files created under `tests/unit/`:

| File | Tests |
|------|-------|
| `vitest.config.unit.ts` | config only |
| `utils/phone-normalization-and-validation.test.ts` | 17 tests |
| `utils/csv-formula-injection-sanitizer.test.ts` | 14 tests |
| `validation/zod-form-schemas-vietnamese-validation.test.ts` | 38 tests |
| `services/lead-status-transition-rules.test.ts` | 25 tests |
| `services/payment-matching-and-conversion-trigger.test.ts` | 21 tests |
| `services/ai-distribution-weighted-scoring.test.ts` | 21 tests |
| `services/assignment-template-round-robin-distribution.test.ts` | 16 tests |
| `services/auto-recall-pool-expiry-logic.test.ts` | 22 tests |
| `guards/roles-guard-authorization-logic.test.ts` | 18 tests |

**Total: ~192 tests across 9 test files**

### Tasks Completed
- [x] vitest.config.unit.ts — node env, include tests/unit/**/*.test.ts
- [x] phone-normalization-and-validation.test.ts — tested normalizePhone, isValidVNPhone, formatPhoneDisplay from actual source
- [x] csv-formula-injection-sanitizer.test.ts — tested sanitizeCsvCell (tab prefix, not quote), sanitizeCsvRow
- [x] zod-form-schemas-vietnamese-validation.test.ts — all 7 schemas + parseZodErrors, Vietnamese error messages
- [x] lead-status-transition-rules.test.ts — pure ALLOWED_TRANSITIONS map, all valid/invalid paths, CONVERTED terminal
- [x] payment-matching-and-conversion-trigger.test.ts — amount+content match, ambiguous candidates, partial payment conversion
- [x] ai-distribution-weighted-scoring.test.ts — workload/level/performance weights, combined score, pickBestUser, edge cases
- [x] assignment-template-round-robin-distribution.test.ts — 7/3, 10/2, 1/3, 0 leads, skip non-POOL/FLOATING, 100/7
- [x] auto-recall-pool-expiry-logic.test.ts — lead+customer eligibility, cutoffDate, batch filter, autoLabelIds
- [x] roles-guard-authorization-logic.test.ts — SUPER_ADMIN bypass, MANAGER/USER access, null user, mock Reflector

### Tests Status
- Type check: not run (write-only task)
- Unit tests: not run (write-only task)
- Integration tests: N/A

### Key Implementation Decisions
1. **Pure logic extraction**: All tests use extracted pure functions — no Prisma, no NestJS DI, no HTTP. DB-coupled services (ScoringService, PaymentMatchingService, RecallConfigService, AssignmentTemplatesService) have their core logic re-implemented as testable pure functions inline.
2. **csv-sanitizer correction**: Task spec said prefix with `'` but actual source uses `\t` (tab). Tests reflect the real implementation.
3. **MANAGER role**: `canActivateRole(['USER'], MANAGER)` returns `false` — matching actual `requiredRoles.includes(user.role)` logic, not a hierarchy check.
4. **formatPhoneDisplay**: 10-digit → `xxx xxx xxxx` (3-3-4), 11-digit → `xxxx xxx xxxx` (4-3-4), matching actual source slicing.

### Issues Encountered
None. All source files read before writing tests.

### Next Steps
- Install vitest if not present: `pnpm add -D vitest -w`
- Add script to root package.json: `"test:unit": "vitest run --config tests/unit/vitest.config.unit.ts"`
- Run: `pnpm test:unit`
