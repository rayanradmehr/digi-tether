export const QUEUE_EXCHANGE = {
  MAIN: 'digi.exchange',
  DEAD_LETTER: 'digi.dlx',
} as const;

export const QUEUE_ROUTING_KEY = {
  // Reserved namespaces — routing keys for future business modules go here
  // Example: DEPOSIT_CREATED: 'deposit.created'
} as const;

export const QUEUE_NAME = {
  DEAD_LETTER: 'digi.dlq',
} as const;
