# 102 — Phase 1 Promotion Evaluation Kernel

**Status:** IMPLEMENTED (quote only). Phase 2 application: [108](./108-STAGE-E-PROMOTION-PHASE-2-APPLICATION-REDEMPTION.md)  
**Date:** 2026-09-05  
**Contract:** [101](./101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md)  
**Browse forensic:** [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) — do not implement

## What shipped

Reusable Nest kernel, no HTTP:

- `PromotionEvaluationService.evaluate(context)`
- Domain classify / quote / select-best in `promotion-evaluation.ts`
- Read-only `PromotionEvaluationRepository`

`Offer` is the v1 Promotion. `Coupon` is an optional code. `CouponRedemption` is read for usage counts only.

## What did not ship

No Prisma schema/migration. No checkout, cart, payment, or order changes. No consumer/merchant UI. No browse API. No `CouponRedemption` writes. No reservation/hold.

## Commit vs quote

Evaluation never reserves usage. Final redemption stays on the existing transactional checkout path (`createOrder` / `deferRedemption` / `promoteOnPaymentCapture`).

## Phase 2

Cart/checkout/order now call `evaluate()` through `PromotionApplicationService` and feed `discountMinor` into the Stage D quote. The kernel itself remains read-only. See [108](./108-STAGE-E-PROMOTION-PHASE-2-APPLICATION-REDEMPTION.md).
