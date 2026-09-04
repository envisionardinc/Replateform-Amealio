import { Global, Module } from '@nestjs/common';
import { DOMAIN_EVENT_BUS, DomainEventBus } from './domain-event-bus';
import { InProcessEventBus } from './in-process-event-bus';

/** Provides the DomainEventBus port (in-process default). Foundation seam only. */
@Global()
@Module({
  providers: [
    InProcessEventBus,
    { provide: DomainEventBus, useExisting: InProcessEventBus },
    { provide: DOMAIN_EVENT_BUS, useExisting: InProcessEventBus },
  ],
  exports: [DomainEventBus, DOMAIN_EVENT_BUS],
})
export class EventsModule {}
