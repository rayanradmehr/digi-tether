# shared/events

In-process domain event bus abstraction.

## Files
- `app-event.interface.ts` — `AppEvent` base interface + `createEvent()` factory
- `event-publisher.interface.ts` — `IEventPublisher` contract (publish/publishAll)
- `event-publisher.service.ts` — `NullEventPublisher` — no-op stub for Phase 1
- `events.module.ts` — `EventsModule` — global module, registers `INJECTION_TOKENS.EVENT_PUBLISHER`

## Usage in a module
```ts
@Inject(INJECTION_TOKENS.EVENT_PUBLISHER) private readonly events: IEventPublisher
// ...
this.events.publish(createEvent('user.created', { id: '1' }));
```

## Replacing the implementation
Bind an EventEmitter2-backed class to `INJECTION_TOKENS.EVENT_PUBLISHER` in `EventsModule`.

## Rules
- Concrete event classes live in the owning feature module
- Listeners live in the owning feature module
- This layer provides only the bus contract and registration
