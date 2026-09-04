import type { DomainEvent, DomainEventHandler } from './domain-event';

/**
 * Port for publishing/subscribing to domain events.
 * The in-process implementation is the default seam; this can later be swapped
 * for an outbox + message broker WITHOUT changing domain code.
 */
export abstract class DomainEventBus {
  abstract publish(event: DomainEvent): Promise<void>;
  abstract subscribe(eventName: string, handler: DomainEventHandler): void;
}

/** Injection token for the DomainEventBus port. */
export const DOMAIN_EVENT_BUS = Symbol('DOMAIN_EVENT_BUS');
