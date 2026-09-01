/** Base contract for internal domain events (P1.6 foundation).
 * Future domains publish events without coupling to external providers/brokers.
 */
export interface DomainEvent<TPayload = unknown> {
  /** Stable event name, e.g. "order.placed" (domains define their own). */
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
  /** Optional correlation id for tracing across handlers. */
  readonly correlationId?: string;
}

export type DomainEventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => void | Promise<void>;
