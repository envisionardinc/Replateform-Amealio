import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { DomainEvent, DomainEventHandler } from './domain-event';
import { DomainEventBus } from './domain-event-bus';

/**
 * Lightweight in-process event bus (default P1.6 implementation).
 * Sufficient for a modular monolith; replaceable by an async transport later.
 * NOTE: no domain events are published yet — this is foundation only.
 */
@Injectable()
export class InProcessEventBus extends DomainEventBus {
  private readonly logger = new Logger('DomainEventBus');
  private readonly emitter = new EventEmitter();

  constructor() {
    super();
    this.emitter.setMaxListeners(0);
  }

  async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(`publish ${event.name}`);
    this.emitter.emit(event.name, event);
  }

  subscribe(eventName: string, handler: DomainEventHandler): void {
    this.emitter.on(eventName, (event: DomainEvent) => {
      void Promise.resolve(handler(event)).catch((err) =>
        this.logger.error(`handler for ${eventName} failed`, err as Error),
      );
    });
  }
}
