# shared/events

In-process event system via `EventEmitter2` (`@nestjs/event-emitter`).

## Files
- `app-event.interface.ts` — `AppEvent` base interface (type + timestamp)
- `events.module.ts` — `EventsModule` (registered globally)

## Rules
- Concrete event classes live in the module that owns the domain, NOT here
- Event listeners live in the feature module, NOT here
- This layer only provides the bus registration and the base contract
