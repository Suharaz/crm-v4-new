# Phase 07: Orders + Payments

## Priority: MEDIUM
## Status: Pending
## Blocked by: Phase 04, Phase 05

## Overview
Add create order (from lead/customer detail), change order status, create payment, verify/reject payment.

## API Endpoints
- POST `/orders` — create
- PATCH `/orders/:id/status` — change status (MANAGER+)
- DELETE `/orders/:id` — delete (SUPER_ADMIN)
- POST `/payments` — create payment
- POST `/payments/:id/verify` — verify (MANAGER+)
- POST `/payments/:id/reject` — reject (MANAGER+)

## Implementation

### Components
1. **components/orders/order-form.tsx** — create order form (customer, product, amount, notes)
2. **components/orders/order-status-dialog.tsx** — change status
3. **components/orders/order-actions.tsx** — action bar on detail page
4. **components/payments/payment-form-dialog.tsx** — create payment for order
5. **components/payments/payment-actions.tsx** — verify/reject buttons

### Create Order Flow
- From lead/customer detail → "Tạo đơn hàng" button
- Select product → auto-fill price + VAT calc
- Submit → redirect to order detail

### Order Detail Enhancement
- Add status change dropdown (MANAGER+)
- Add "Thêm thanh toán" button
- Show verify/reject buttons on pending payments

## Success Criteria
- Create order from lead/customer context
- Status transitions working
- Payment creation + verify/reject
- Auto VAT calculation
