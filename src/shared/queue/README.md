# shared/queue

Async message queue abstraction.

## Files
- `queue.interface.ts` — `IQueuePublisher` + `IQueueConsumer<T>` contracts
- `queue.publisher.ts` — `NullQueuePublisher` — no-op stub for Phase 1
- `queue.consumer.base.ts` — `BaseQueueConsumer<T>` — abstract base for feature consumers
- `queue.module.ts` — `QueueModule` — global module, registers `INJECTION_TOKENS.QUEUE_PUBLISHER`

## Message shape
All messages use `QueueMessage<T>` from `shared/types`.
Exchange and routing key constants live in `@common/constants/queue.constants`.

## Replacing the implementation
Bind a RabbitMQ class to `INJECTION_TOKENS.QUEUE_PUBLISHER` in `QueueModule`.

## Rules
- Inject via `INJECTION_TOKENS.QUEUE_PUBLISHER` + `IQueuePublisher` type
- Message payload schemas live in the feature module, NOT here
