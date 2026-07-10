# RFC-0002: Ledger Core Production Closeout

Status: **Proposed**

Date: 2026-07-10

Discussion: [RFC-0002](https://github.com/orgs/mavulahq/discussions/4)

## Resumo

Esta RFC define o fechamento de produção do `ledger-core` como fonte da verdade financeira do MAVULA. O objetivo é tornar APIs, autorização, isolamento por tenant, idempotência, reversões, auditoria e contratos públicos seguros para operações institucionais.

RFC-0002 continua a linha da RFC-0001: PostgreSQL, ledger e serviços de comando permanecem fontes da verdade. Outbox/Inbox continuam a ser usados para integração, projeções e auditoria operacional. Esta RFC não introduz Event Sourcing financeiro.

## Relação com RFC-0001

RFC-0001 definiu fronteiras de contexto, ownership, CQRS seletivo, Outbox/Inbox, catálogo de eventos e as primeiras fatias verticais de eventos. RFC-0002 fecha o lado de comando do `ledger-core` para que integrações e futuras superfícies operacionais possam depender de contratos financeiros estáveis.

Eventos de domínio continuam regidos por RFC-0001. Novos eventos só podem ser ativados quando tiverem payload schema, producer, consumer idempotente quando aplicável, testes e observabilidade.

## Problema

O `ledger-core` já contém as bases de produto, ledger, lending, transações, workflow, audit trail, Outbox/Inbox, projeções e APIs HTTP. Ainda faltam controles necessários para produção:

- autenticação e autorização consistentes em todas as APIs públicas;
- DTOs e validação runtime explícita para comandos de escrita;
- isolamento por tenant aplicado de forma repetível em migrations, Prisma e conexões PostgreSQL reutilizadas;
- ciclo completo de contas, reversões, correções e aprovações operacionais;
- idempotência durável para side effects de workflows;
- contratos OpenAPI versionados para APIs públicas e partner;
- taxonomia de auditoria financeira que substitua classificações narrativas.

## Objetivos

- Garantir que APIs públicas rejeitam requests sem autenticação, tenant e permissão adequados.
- Tornar o isolamento por tenant verificável por teste, migration e runtime.
- Fechar lifecycle financeiro crítico sem delegar invariantes ao `workbench`.
- Garantir que mutações financeiras são idempotentes, auditáveis e reversíveis por workflows controlados.
- Publicar contratos HTTP versionados antes de expor superfícies institucionais.
- Formalizar classificação técnica para `AuditTrailEvent`, absorvendo o draft anterior da RFC-0002 sobre `phase`.

## Não objetivos

- Transformar ledger, lending ou audit trail em Event Sourcing.
- Transferir ownership financeiro para `workbench` ou `settlements`.
- Implementar M-Pesa, e-Mola, bank-transfer adapters ou settlement files.
- Implementar `console`, mobile ou intelligence.
- Criar novos eventos ativos fora dos critérios da RFC-0001.

## Fatias de entrega

### 1. Segurança de API

Todas as APIs públicas de `ledger-core` devem exigir autenticação e autorização. Endpoints internos de worker continuam separados por guard próprio.

Requisitos mínimos:

- `Authorization` obrigatório para APIs públicas;
- `X-Tenant-ID` obrigatório em operações tenant-scoped;
- guards globais ou explícitos por controller;
- RBAC por operação de leitura, escrita, aprovação e administração;
- remoção de fallback público para comandos tenant-scoped;
- DTOs versionados e validação runtime para payloads públicos.

### 2. Isolamento de tenant e RLS

Tenant isolation deve ser uma propriedade testável do runtime, não apenas uma convenção de serviços.

Requisitos mínimos:

- RLS em migrations repetíveis;
- role de aplicação sem bypass;
- tenant context aplicado dentro da mesma transação que executa a query;
- testes que provam que conexões reutilizadas não vazam tenant context;
- cobertura cross-tenant para HTTP, Prisma, jobs, logs e exports.

### 3. Operações financeiras controladas

O `ledger-core` deve fechar o ciclo operacional mínimo de contas e correções financeiras.

Requisitos mínimos:

- APIs de account get, balance, statement, freeze, close e status transition;
- reversões e correções com aprovação, actor, motivo e audit trail;
- trial balance balanceado após lifecycle, retry, reversal e concorrência;
- nenhuma mutação financeira executada diretamente por evento de pagamento;
- audit trail obrigatório para operações aprovadas, rejeitadas, postadas, revertidas, falhadas e configuradas.

### 4. Idempotência, contratos e observabilidade

Mutações financeiras e workflows com side effects devem ser reexecutáveis sem duplicação.

Requisitos mínimos:

- `Idempotency-Key` obrigatório para writes financeiros e workflows com side effects;
- receipts duráveis por tenant, operação e idempotency key;
- OpenAPI versionado para APIs públicas e partner;
- endpoints internos excluídos da superfície pública;
- métricas e logs estruturados para falhas de auth, RLS, idempotência, reversões e contratos inválidos.

## Interfaces públicas

RFC-0002 deve estabilizar contratos HTTP para:

- Accounts: create, list, get, balance, statement, freeze, close e status transition;
- Lending: application, approval, rejection, disbursement, repayment, reversal e correction references;
- Products, rules, schemas e workflows: DTOs validados e permissões explícitas;
- Internal worker callbacks: API interna separada e protegida por guard.

Headers obrigatórios:

- `Authorization`;
- `X-Tenant-ID` para operações tenant-scoped;
- `Idempotency-Key` para writes financeiros e side effects.

## Auditoria

O draft anterior da RFC-0002 sobre `AuditTrailEvent.phase` passa a ser tratado como parte desta RFC.

A decisão proposta é introduzir uma classificação técnica de auditoria com compatibilidade para dados existentes. A taxonomia final deve distinguir etapa, resultado e categoria quando necessário, sem substituir ledger, eventos de domínio ou autorização.

Valores candidatos:

- `REQUESTED`
- `VALIDATED`
- `EVALUATED`
- `AUTHORIZED`
- `REJECTED`
- `POSTED`
- `REVERSED`
- `FAILED`
- `CONFIGURED`
- `DISPATCHED`

A implementação deve decidir se mantém `phase` como campo legado ou introduz um campo novo com janela de compatibilidade.

## Ordem recomendada

1. Guards, DTOs e remoção de fallback público nos controllers.
2. RLS transacional e testes cross-tenant.
3. Account lifecycle e contratos públicos mínimos.
4. Reversões, correções e audit trail técnico.
5. Receipts duráveis de idempotência.
6. OpenAPI versionado e documentação pública.

## Plano de testes

- `pnpm --filter @mavula/ledger-core test`
- `pnpm --filter @mavula/ledger-core test:e2e`
- `pnpm --filter @mavula/ledger-core test:financial`
- `pnpm --filter @mavula/ledger-core guardian:check`
- `pnpm contracts:check`

Cenários obrigatórios:

- request sem auth é rejeitado;
- role insuficiente é rejeitada;
- tenant A não lê nem altera dados do tenant B;
- RLS aplica dentro de transações e conexões reutilizadas;
- replay com mesma idempotency key não duplica mutação financeira;
- reversão ou correção mantém trial balance balanceado;
- OpenAPI cobre endpoints públicos e não expõe endpoints internos.

## Critérios de aceite

- Todas as APIs públicas de escrita usam DTOs validados, auth, tenant e RBAC.
- Toda mutação financeira pública exige idempotency key e registra audit trail.
- Tenant isolation é provado por teste automatizado em HTTP, Prisma e jobs.
- Reversões e correções preservam invariantes financeiras.
- OpenAPI versionado existe para APIs públicas e partner.
- A classificação de audit trail deixa de depender de linguagem narrativa.

## Questões abertas

1. `AuditTrailEvent` deve manter `phase` como campo legado ou introduzir um campo novo?
2. Qual é o conjunto mínimo de roles para operadores institucionais?
3. OpenAPI deve ser publicado no repo principal ou em documentação dedicada?
4. A primeira implementação deve começar por guards/DTOs ou por RLS transacional?
5. Há requisitos regulatórios de Moçambique que imponham campos adicionais no audit trail ou nos exports?
