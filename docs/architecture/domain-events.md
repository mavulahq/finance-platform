# Contrato de eventos de domínio

Estado: **Accepted**

Decisão: 2026-06-27

RFC: [RFC-0001](https://github.com/orgs/getfluxo-io/discussions/1)

Os schemas e o catálogo canônicos ficam em [`contracts/domain-events`](../../contracts/domain-events/). Esta fase define linguagem e contratos; nenhum evento do catálogo é considerado publicado enquanto estiver com estado `proposed`.

## Evento, comando e job

| Conceito          | Semântica                                          | Exemplo                  |
| ----------------- | -------------------------------------------------- | ------------------------ |
| Comando           | intenção que pode ser aceite ou rejeitada          | `DisburseLoan`           |
| Evento de domínio | facto imutável que já aconteceu                    | `lending.loan_disbursed` |
| Job               | unidade operacional de trabalho, passível de retry | `FENGINE_EVENT`          |

Um job pode transportar ou reagir a um evento, mas não altera a semântica do evento.

## Nomenclatura

- Formato: `<context>.<fact_in_past_tense>` em lowercase snake case.
- O nome descreve um facto de negócio, não uma implementação ou destino.
- A versão não faz parte do nome; usa o campo inteiro `event_version` iniciado em `1`.
- Exemplos válidos: `lending.loan_disbursed`, `ledger.journal_posted`.
- Exemplos inválidos: `SEND_SMS`, `loan.process`, `fwk.job.finished`.

## Envelope

O envelope JSON exige:

- identidade global `event_id` no formato `evt_<uuid>`;
- `event_type`, `event_version` e `occurred_at` em UTC;
- `tenant_id` e agregado com tipo, id e versão;
- `correlation_id` e `causation_id` para reconstruir a cadeia;
- `payload` específico do evento;
- metadata com producer e classificação dos dados;
- `idempotency_key` quando existe uma identidade de negócio adicional ao `event_id`.

O schema rejeita campos desconhecidos no envelope. O payload é evoluído pelo owner e ganhará schema específico antes de um evento mudar para `active`.

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
