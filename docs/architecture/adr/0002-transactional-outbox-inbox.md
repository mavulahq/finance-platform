# ADR-0002: Transactional Outbox e Inbox

- Estado: Accepted
- Data: 2026-06-21
- Decisão: 2026-06-27
- RFC: [RFC-0001](https://github.com/orgs/getfluxo-io/discussions/1)

## Contexto

Confirmar uma alteração no PostgreSQL e publicar diretamente numa queue cria um dual write: uma parte pode concluir enquanto a outra falha.

## Decisão

O producer gravará a alteração do agregado e o evento Outbox na mesma transação PostgreSQL. Um publisher separado enviará eventos pendentes por um adapter de transporte, com retry, métricas e estado observável.

Consumidores tratarão entrega como at-least-once e registrarão `event_id` numa Inbox persistente dentro da mesma transação do efeito. Replays preservarão event id, correlação e causação.

A decisão é independente de broker. BullMQ permanece a queue atual de jobs e poderá ser usado por um adapter inicial, mas um job não será tratado como registo canônico do evento.

## Consequências

- A Fase 2 precisa definir tabelas, leasing, publisher, retenção, Inbox e recuperação de falhas.
- Exactly-once não será prometido; efeitos efetivamente únicos dependem de idempotência e deduplicação.
- Lag, retries, idade do Outbox e DLQ tornam-se sinais operacionais obrigatórios.
