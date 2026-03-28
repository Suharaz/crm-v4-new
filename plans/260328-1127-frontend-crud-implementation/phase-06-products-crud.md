# Phase 06: Products CRUD

## Priority: MEDIUM
## Status: Pending
## Blocked by: Phase 01

## Overview
Add create/edit/delete for products. Dialog-based (simple entity).

## API Endpoints
- POST `/products` — create (MANAGER+)
- PATCH `/products/:id` — update (MANAGER+)
- DELETE `/products/:id` — delete (SUPER_ADMIN)
- GET `/product-categories` — for category dropdown

## Implementation

### Components
1. **components/products/product-form-dialog.tsx** — create/edit dialog
2. **components/products/product-list-client.tsx** — client wrapper with action buttons

### Form Fields
- name* (text)
- price* (number, Decimal)
- description (textarea)
- categoryId (select from product categories)
- vatRate (number, default 0)

### Page Enhancement
- Add "Thêm sản phẩm" button on products page
- Add edit/delete icons on each product card

## Success Criteria
- Create product with price + VAT
- Edit product
- Delete with confirmation
- Category dropdown populated
