# Phase 04 — Compile + test + commit

## Steps

1. `pnpm --filter @crm/api build` — kiểm tra backend compile
2. `pnpm --filter @crm/web build` (hoặc `lint`) — kiểm tra frontend compile
3. `pnpm --filter @crm/api test recall-config` — chạy unit test recall (đảm bảo cron change không phá test)
4. Commit conventional: `feat(recall): add label recall config UI in settings`
5. Push origin master

## Success Criteria

- [ ] Both builds pass (no type/lint errors)
- [ ] All recall tests pass
- [ ] Commit + push thành công
