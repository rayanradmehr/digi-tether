# shared/queue

RabbitMQ integration via `@nestjs/microservices` + `amqplib`.

## Files
- `queue.publisher.ts` — `QueuePublisher` service for outbound messages
- `queue.consumer.base.ts` — `BaseQueueConsumer` abstract class for inbound handlers
- `queue.module.ts` — `QueueModule` (registered globally)

## Rules
- Message payload shapes live in the feature module, NOT here
- Business logic triggered by a message lives in the feature module, NOT here
- Domain-specific retry logic lives in the feature module, NOT here
- Exchange names and routing keys come from `common/constants/queue.constants.ts`
