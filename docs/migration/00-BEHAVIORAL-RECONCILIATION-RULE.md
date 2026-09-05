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

| Class | Meaning |
| ----- | ------- |
| PRESERVE | amealio intent is clear and safe; keep it |
| IMPROVE | same intent, safer or clearer mechanism |
| CORRECT | legacy or industry pattern is unsafe / obsolete; do not copy |
| OWNER DECISION | genuine product/finance choice; do not guess |
| FUTURE | out of the next implementation slice |

## Current application

- Merchant orders: [domains/88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md](./domains/88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md) (evidence: [87](./domains/87-MERCHANT-ORDER-MANAGEMENT-FORENSIC-RECONCILIATION.md))
- Consumer ordering + payment: [domains/90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md](./domains/90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)
- Self-delivery: [domains/91-SELF-DELIVERY-TARGET-BEHAVIOR-CONTRACT.md](./domains/91-SELF-DELIVERY-TARGET-BEHAVIOR-CONTRACT.md)
- User app + Home Page V2: [domains/92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md](./domains/92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md)
