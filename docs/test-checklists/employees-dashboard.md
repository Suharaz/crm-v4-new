# Manual smoke - /dashboard/employees redesign

**Plan:** `plans/260511-1614-employees-dashboard-redesign`
**Updated:** 2026-05-12

## Pre-conditions

- API server chạy `pnpm dev` (port 3010)
- Web server chạy `pnpm dev` (port 3011)
- Login với user role `MANAGER` hoặc `SUPER_ADMIN`
- Migration `20260512085312_add_call_logs_user_time_index` đã apply

## API endpoints smoke

```bash
# 1. employee-scores (extend với 3 field mới)
curl -s "http://localhost:3010/api/v1/dashboard/employee-scores?from=2026-04-01&to=2026-05-01" \
  -H "Cookie: access_token=$TOKEN" | jq '.data[0]'
# Verify keys: ordersCount, productsCount, untouchedLeads, leadsAssigned, revenue

# 2. employee-reports/calls (mới)
curl -s "http://localhost:3010/api/v1/dashboard/employee-reports/calls?from=2026-04-01&to=2026-05-01" \
  -H "Cookie: access_token=$TOKEN" | jq '.data[0]'
# Verify keys: callsAnswered, callsOutgoing, outgoingTotalSeconds, outgoingAvgSeconds

# 3. employee-reports/sales-breakdown (mới, dynamic columns)
curl -s "http://localhost:3010/api/v1/dashboard/employee-reports/sales-breakdown?from=2026-04-01&to=2026-05-01" \
  -H "Cookie: access_token=$TOKEN" | jq '.data | {topLabels: .topLabels, rowCount: (.rows | length)}'
# Verify topLabels là array (tối đa 7), rows có labelCounts/otherCount/untouchedCount

# 4. drill-down (3 mode)
# Mode labelId:
curl -s "http://localhost:3010/api/v1/dashboard/employee-reports/sales-breakdown/customers?userId=16&labelId=26&from=2026-04-01&to=2026-05-01" \
  -H "Cookie: access_token=$TOKEN" | jq '.data | {total: .total, dataCount: (.data | length)}'

# Mode untouched:
curl -s "http://localhost:3010/api/v1/dashboard/employee-reports/sales-breakdown/customers?userId=16&untouched=true&from=2026-04-01&to=2026-05-01" \
  -H "Cookie: access_token=$TOKEN" | jq '.data.total'

# Mode other:
curl -s "http://localhost:3010/api/v1/dashboard/employee-reports/sales-breakdown/customers?userId=16&other=true&from=2026-04-01&to=2026-05-01" \
  -H "Cookie: access_token=$TOKEN" | jq '.data.total'
```

## Role guard

- [ ] Login user role `USER` thường → GET 4 endpoint mới → trả 403 (forbidden)
- [ ] Login user role `MANAGER` → GET → 200
- [ ] Login user role `SUPER_ADMIN` → GET → 200

## Frontend UI

### Tổng quát
- [ ] Load `/dashboard/employees` không lỗi console
- [ ] Header: title + dept select + range pills hiển thị
- [ ] Summary KPI cards 3 ô hiển thị đúng số
- [ ] Tab bar có 3 tab: "Báo cáo tổng", "Báo cáo cuộc gọi", "Bán hàng"

### Tab "Báo cáo tổng"
- [ ] 10 cột hiển thị: Số lead, Lead chưa TN, Số đơn, Số SP, Doanh số, Doanh số/Lead, Giá trị đơn TB, Tỉ lệ chốt, Số cuộc gọi, Số phút gọi
- [ ] Cột formula hiển thị "(1)", "(=5/1)", "(=5/3)", "(=3/1)" dưới label
- [ ] Bar trong cell tỉ lệ đúng với max cột
- [ ] Click cột header sort được
- [ ] Totals row hiển thị tổng mỗi cột
- [ ] Sticky STT + Nhân viên khi scroll ngang

### Tab "Báo cáo cuộc gọi"
- [ ] 3 cột: Nghe máy/Gọi ra, Tổng TG gọi ra, TG gọi TB
- [ ] Cột 1 hiển thị format "{answered}/{outgoing}" với màu khác nhau
- [ ] Cột 2, 3 format duration mm:ss hoặc Xh Ym

### Tab "Bán hàng"
- [ ] Cột động đúng theo `topLabels` từ API (tên label thật)
- [ ] Cột "Khác" + "KH chưa tiếp cận" ở cuối
- [ ] Bar màu của label cột đúng tone (map hex → palette)
- [ ] Click cell mở side-panel drill-down
- [ ] Side-panel header hiển thị tên NV + label name + range
- [ ] Side-panel list KH có name + phone + labels + ordersCount + revenue
- [ ] Tải thêm hoạt động (nếu total > 50)
- [ ] Close panel: click X / overlay / Esc

### Range / Dept filter
- [ ] Đổi range (week/month/quarter) → table re-fetch
- [ ] Đổi dept → table re-fetch
- [ ] Đổi range khi panel mở → panel re-fetch theo range mới

### URL state
- [ ] `?tab=sales` refresh giữ tab sales
- [ ] `?tab=calls` refresh giữ tab calls
- [ ] Back/forward browser hoạt động

### Mobile (DevTools 375px)
- [ ] Tab bar scroll ngang
- [ ] Table sticky 2 cột đầu (STT + Tên)
- [ ] Side-panel full-screen

### Edge cases
- [ ] User role USER vào trang → "Bạn không có quyền"
- [ ] Range không có data → empty state
- [ ] Top labels < 7 (DB ít label) → table chỉ hiện số có

## Performance (ad-hoc qua DevTools Network)

- [ ] employee-scores: < 500ms
- [ ] employee-reports/calls: < 800ms
- [ ] employee-reports/sales-breakdown: < 1000ms
- [ ] sales-breakdown/customers: < 300ms
- [ ] Cache hit lần 2 (đổi tab back): < 100ms

## Known limitations

- "Số sản phẩm" = count orders có `product_id IS NOT NULL` (schema không có order_items để sum quantity).
- "Số cuộc gọi" tab Tổng = `callsOutgoing` (tổng OUTGOING), không phải answered + outgoing.
- DB dev có thể chưa có `label_text_color` migration applied nếu vừa pull (`text_color` field). Plan giả định đã apply.
