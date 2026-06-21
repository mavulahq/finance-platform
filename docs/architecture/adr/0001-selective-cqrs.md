# ADR-0001: CQRS seletivo

- Estado: Accepted
- Data: 2026-06-21
- Decisão: 2026-06-27
- RFC: [RFC-0001](https://github.com/orgs/getfluxo-io/discussions/1)

## Contexto

Operações financeiras possuem invariantes e necessidades de consistência diferentes das consultas operacionais. Aplicar CQRS a todo CRUD criaria duplicação sem benefício mensurável.

## Decisão

Separar comandos e consultas somente quando a fronteira melhora correção, autorização, idempotência, escalabilidade ou autonomia de um read model. Comandos expressam intenção, carregam tenant, ator, correlação e idempotência quando aplicável, e aplicam invariantes na transação do contexto owner.

Consultas podem usar projeções eventualmente consistentes quando o caso de uso declarar freshness e fallback. Consultas usadas para decisões financeiras síncronas leem uma fonte com consistência suficiente para preservar a invariante.

CQRS não implica Event Sourcing. PostgreSQL e o ledger continuam fontes da verdade.

## Consequências

- CRUD simples pode continuar compartilhando o modelo atual.
- Cada read model deve declarar owner, freshness, reconstrução e comportamento durante lag.
- A separação exige métricas de projeção e testes de consistência nos fluxos que a adotarem.
