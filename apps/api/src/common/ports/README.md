# Provider / Integration Ports (CONVENTION — no integrations implemented)

**P1.6 establishes the convention only. No external integration is implemented.**

External systems are reached through **ports** (interfaces) declared by the domain/application layer; **adapters** in `infrastructure/` implement them. Domain code depends on the port, never on a provider SDK. This keeps integrations swappable and preserves clean extraction seams.

## Pattern

```ts
// domain/application declares the port (interface + injection token)
export abstract class PaymentProvider {
  abstract createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
}
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

// infrastructure provides an adapter (added ONLY when that integration is implemented)
// { provide: PAYMENT_PROVIDER, useClass: RazorpayPaymentProvider }
```

## Future ports (NOT implemented here)
- `PaymentProvider` (Razorpay / RazorpayX)
- `MessagingProvider` / `EmailProvider` / `PushProvider` (MSG91 / SendGrid / FCM)
- `DeliveryPartner` and delivery `TrackingProvider` (deferred)
- `RecommendationProvider` (external, deferred)
- `OndcProvider` (deferred / owner-decision)

The only concrete port shipped in P1.6 is the internal **`DomainEventBus`** (`../events/`), used as the reference example. Do **not** add fake provider implementations — they could be mistaken for production behavior.
