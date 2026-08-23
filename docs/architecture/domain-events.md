# Contrato de eventos de domínio

Estado: **Accepted**

Decisão: 2026-06-27

RFC: [RFC-0001](https://github.com/orgs/mavulahq/discussions/1)

Os schemas e o catálogo canônicos ficam em [`contracts/domain-events`](../../contracts/domain-events/). Eventos com estado `proposed` continuam sendo linguagem de arquitetura, não contratos publicados. As fatias ativas atuais são `products.configuration_published`, `ledger.journal_posted`, `ledger.adjustment_posted`, `lending.loan_disbursed`, `lending.payment_posted`, `lending.adjustment_applied` e `payments.settlement_completed`.

## Evento, comando e job

| Conceito          | Semântica                                          | Exemplo                  |
| ----------------- | -------------------------------------------------- | ------------------------ |
| Comando           | intenção que pode ser aceite ou rejeitada          | `DisburseLoan`           |
| Evento de domínio | facto imutável que já aconteceu                    | `lending.loan_disbursed` |
| Job               | unidade operacional de trabalho, passível de retry | `LEDGER_CORE_EVENT`          |

Um job pode transportar ou reagir a um evento, mas não altera a semântica do evento.

## Nomenclatura

- Formato: `<context>.<fact_in_past_tense>` em lowercase snake case.
- O nome descreve um facto de negócio, não uma implementação ou destino.
- A versão não faz parte do nome; usa o campo inteiro `event_version` iniciado em `1`.
- Exemplos válidos: `lending.loan_disbursed`, `ledger.journal_posted`.
- Exemplos inválidos: `SEND_SMS`, `loan.process`, `workbench.job.finished`.

## Envelope

O envelope JSON exige:

- identidade global `event_id` no formato `evt_<uuid>`;
- `event_type`, `event_version` e `occurred_at` em UTC;
- `tenant_id` e agregado com tipo, id e versão;
- `correlation_id` e `causation_id` para reconstruir a cadeia;
- `payload` específico do evento;
- metadata com producer e classificação dos dados;
- `idempotency_key` quando existe uma identidade de negócio adicional ao `event_id`.

O schema rejeita campos desconhecidos no envelope. O payload é evoluído pelo owner e precisa ter schema específico antes de um evento mudar para `active`.

Este contrato usa Transactional Outbox/Inbox. Ele não transforma os agregados financeiros em Event Sourcing; PostgreSQL e ledger continuam fontes da verdade para comandos e invariantes.

## Evolução

- Alterações aditivas e opcionais podem manter a versão.
- Remoção, rename, mudança de tipo ou nova semântica incompatível exige nova versão.
- Consumidores ignoram campos opcionais desconhecidos e declaram as versões suportadas.
- Producers mantêm a versão anterior durante a janela de migração definida no PR da mudança.
- Eventos publicados são imutáveis; correções são novos eventos com correlação explícita.

## Garantias

- Publicação e efeitos assumem at-least-once.
- O consumidor registra `event_id` numa Inbox persistente dentro da transação do seu efeito.
- Ordenação é garantida apenas quando declarada no catálogo e normalmente usa tenant mais agregado.
- Dinheiro usa o tipo `money` definido no schema: decimal em string e moeda ISO 4217.
- PII e secrets são minimizados; a classificação mais restritiva entre envelope e payload prevalece.

## Ativação de um evento

Um evento só muda de `proposed` para `active` quando possui payload schema versionado, producer implementado com Outbox, consumidor idempotente quando aplicável, testes de compatibilidade e observabilidade operacional.

## Eventos ativos

`products.configuration_published` v1 está ativo como fatia de Product Configuration da Fase 2. O `ledger-core` grava o evento numa Outbox após criar ou atualizar uma configuração de produto, com versão explícita do agregado para consumers reconstruírem a sequência de publicações por tenant e produto.

`ledger.journal_posted` v1 está ativo como fatia de Accounts & Ledger da Fase 2. O `ledger-core` grava o evento numa Outbox após validar e publicar um journal entry balanceado, com linhas e totais por moeda sem incluir descrição livre ou dados pessoais.

`ledger.adjustment_posted` v1 está ativo como facto de uma reversão ou correção aprovada. O evento referencia o journal original, o journal de reversão e, numa correção, o journal substituto. O original permanece imutável e a projeção conserva histórico idempotente para entrega fora de ordem e rebuild.

`lending.loan_disbursed` v1 está ativo como primeira fatia vertical da Fase 2. O `ledger-core` grava o evento numa Outbox após desembolso aprovado; o publisher envia o envelope ao `workbench` pela queue `platform`; o `workbench` chama o endpoint interno de domain events; e o `ledger-core` registra Inbox por consumidor antes de disparar workflows.

`lending.payment_posted` v1 está ativo como segunda fatia vertical da Fase 2. O `ledger-core` grava o evento numa Outbox após um pagamento de empréstimo ser alocado em taxas, juros e principal, com saldo remanescente explícito no payload.

`lending.adjustment_applied` v1 está ativo para ajustes aprovados de pagamentos e desembolsos. O payload identifica a operação original, reversão, substituição quando aplicável, alocação, saldo e versão do empréstimo; o evento é gravado na mesma transação dos efeitos financeiros.

`payments.settlement_completed` v1 está ativo como fatia de Payments da Fase 4. O `settlements` grava o evento numa Outbox após webhook de liquidação reconciliado; o publisher do `workbench` envia o envelope pela queue `platform`; e o `ledger-core` registra Inbox idempotente sem executar mutação financeira direta. Há no máximo uma linha de outbox por processo e `event_type`. Depois de esgotar `maxAttempts`, a linha fica `FAILED` e deixa de ser reclamada. Um replay do webhook `succeeded` num processo já `SETTLED` deve reativar essa linha sem mudar `event_id` nem o payload; ver [settlement-outbox-recovery.md](../runbooks/settlement-outbox-recovery.md). Em `main` esse reset ainda não existe até o merge de #51.
