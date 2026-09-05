# Behavioral Reconciliation Rule

**Applies to:** every major amealio domain on `replatform/backend-consolidation`  
**Date recorded:** 2026-09-04

## Rule

Never treat legacy implementation as the automatic target specification.

For every major business domain:

1. Recover actual legacy behavior from code, APIs, data models, UI flows, and production evidence where available.
2. Independently benchmark the workflow against current industry-standard practices and relevant authoritative documentation.
3. Identify missing capabilities, unsafe behavior, ambiguous behavior, obsolete patterns, financial/data integrity risks, concurrency/idempotency risks, security/privacy risks, operational failure modes, and customer/merchant edge cases.
4. Build a Legacy vs Industry Gap Matrix.
5. Classify every gap: **PRESERVE** | **IMPROVE** | **CORRECT** | **OWNER DECISION** | **FUTURE**.
6. Produce the proposed **TARGET BUSINESS/BEHAVIOR CONTRACT**.
7. Only then implement the target.

## Authority

- Legacy implementation is **evidence**, not authority.
- Industry practice is **evidence**, not authority.
- Neither may silently override amealio business intent.
- When evidence supports the decision, resolve it automatically.
- Escalate only genuine product/business decisions.
- Never invent business rules merely to fill a gap.

## Classification

| Class          | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| PRESERVE       | amealio intent is clear and safe; keep it                    |
| IMPROVE        | same intent, safer or clearer mechanism                      |
| CORRECT        | legacy or industry pattern is unsafe / obsolete; do not copy |
| OWNER DECISION | genuine product/finance choice; do not guess                 |
| FUTURE         | out of the next implementation slice                         |

## Current application

- Merchant orders: [domains/88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md](./domains/88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md) (evidence: [87](./domains/87-MERCHANT-ORDER-MANAGEMENT-FORENSIC-RECONCILIATION.md))
- Consumer ordering + payment: [domains/90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md](./domains/90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)
- Self-delivery: [domains/91-SELF-DELIVERY-TARGET-BEHAVIOR-CONTRACT.md](./domains/91-SELF-DELIVERY-TARGET-BEHAVIOR-CONTRACT.md)
- User app + Home Page V2: [domains/92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md](./domains/92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md)
- Frontend design system: [93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md](./93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md)
- Home 1 taxonomy: [domains/94-HOME-1-TAXONOMY-TARGET-BEHAVIOR-CONTRACT.md](./domains/94-HOME-1-TAXONOMY-TARGET-BEHAVIOR-CONTRACT.md)
- Next consumer surface (order tracking): [domains/95-NEXT-CONSUMER-SURFACE-TARGET-BEHAVIOR-CONTRACT.md](./domains/95-NEXT-CONSUMER-SURFACE-TARGET-BEHAVIOR-CONTRACT.md)
- Consumer profile + dietary preferences: [domains/96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md](./domains/96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md)
- Consumer favorites / saved: [domains/97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md](./domains/97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md)
- Consumer saved addresses: [domains/98-CONSUMER-SAVED-ADDRESSES-TARGET-BEHAVIOR-CONTRACT.md](./domains/98-CONSUMER-SAVED-ADDRESSES-TARGET-BEHAVIOR-CONTRACT.md)
- Consumer offers / coupons browse: [domains/99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md](./domains/99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) — **DEFER — TARGET DEPENDENCY** (legacy browse-only; do not implement)
- Amealio promotions / modern engine: [domains/101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md](./domains/101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md) — Phase 1 kernel: [102](./domains/102-PROMOTION-EVALUATION-KERNEL.md). Phase 2 application + redemption: [108](./domains/108-STAGE-E-PROMOTION-PHASE-2-APPLICATION-REDEMPTION.md).
- Core commerce menu / product / pricing / merchandising: [domains/103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md](./domains/103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md) — Stage A: [104](./domains/104-STAGE-A-ITEM-VARIANT-MODIFIER-FOUNDATION.md). Stage B: [105](./domains/105-STAGE-B-MENU-MERCHANT-CATALOG-CONSISTENCY.md). Stage C: [106](./domains/106-STAGE-C-AVAILABILITY-FOUNDATION.md). Stage D: [107](./domains/107-STAGE-D-PRICING-TAX-FEES-SURCHARGES.md). Stage E Phase 2: [108](./domains/108-STAGE-E-PROMOTION-PHASE-2-APPLICATION-REDEMPTION.md). Stage F combo/bundle: [109](./domains/109-STAGE-F-COMBO-BUNDLE.md). Do not start Stage G without GO.
