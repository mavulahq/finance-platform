# Invariantes e ownership

Estado: **Accepted**

Decisão: 2026-06-27

RFC: [RFC-0001](https://github.com/orgs/mavulahq/discussions/1)

## Invariantes globais

1. Todo comando e evento é associado a um `tenant_id` validado na fronteira de entrada.
2. Nenhum contexto lê ou altera dados de outro tenant fora de uma política explicitamente autorizada.
3. Valores monetários usam decimal em string e uma moeda ISO 4217 explícita nos contratos.
4. Toda mutação financeira é idempotente, auditável e correlacionável com o comando que a causou.
5. PostgreSQL e o ledger permanecem fontes da verdade; Redis é transporte e estado operacional temporário.
6. Entrega entre processos é at-least-once. Consumidores devem deduplicar por `event_id` antes de produzir efeitos.
7. PII, credenciais e secrets não entram em eventos sem necessidade, classificação e política de retenção formalizadas.

## Invariantes por contexto

### Tenant & Identity

- A identidade do tenant não é inferida de payload não confiável quando existe contexto autenticado.
- Autorização e role são avaliadas antes da mutação.
- RLS e contexto transacional devem impedir acesso cruzado mesmo quando a camada HTTP falha.

### Product Configuration

- Uma configuração publicada é versionada e imutável; alterações produzem uma nova versão.
- Regras e fórmulas são avaliadas apenas pelo runtime seguro permitido.
- Produtos referenciados por operações financeiras preservam a versão efetivamente utilizada.

### Accounts & Ledger

- Cada journal entry é balanceada: débitos e créditos possuem o mesmo total e moeda compatível.
- Lançamentos publicados são imutáveis; correções são novas entradas de reversão ou ajuste.
- Saldos não são alterados fora das operações controladas pelo contexto.
- Uma chave de idempotência não pode produzir mais de um efeito financeiro por tenant.

### Lending

- Transições respeitam a máquina de estados do empréstimo e a autorização exigida.
- Um desembolso confirmado ocorre no máximo uma vez por chave de idempotência.
- Pagamentos alocam fees, interest e principal na mesma ordem usada pela transação e pelo saldo do empréstimo.
- Toda alteração financeira do empréstimo possui lançamento correspondente no Accounts & Ledger.

### Payments

- Callbacks de providers são autenticados e protegidos contra replay.
- O mesmo evento externo não pode cobrar, liquidar ou reverter duas vezes.
- Estados de instrução, captura, liquidação, reconciliação e reversão seguem transições explícitas.
- Totais liquidados reconciliam com provider e ledger antes do encerramento operacional.

### Workflow Configuration

- Definições são tenant-scoped, versionadas e validadas antes da ativação.
- Condições e fórmulas usam runtimes seguros, sem `eval` ou `new Function`.
- Workflows não alteram diretamente agregados de outros contextos; usam comandos autorizados.

### Automation Execution

- Retry nunca pressupõe exactly-once; handlers devem ser idempotentes.
- Tentativas são limitadas, observáveis e terminam numa DLQ quando esgotadas.
- Replay requer autorização, motivo auditável e preservação da correlação original.
- O estado de job não substitui o estado de negócio do contexto owner.

### Audit & Reporting

- Registros de auditoria são append-only e preservam tenant, ator, ação, entidade e instante.
- Projeções podem ser eventualmente consistentes e devem ser reconstruíveis.
- Relatórios usados numa decisão financeira síncrona leem uma fonte com a consistência exigida por essa decisão.

## Política de ownership

- O owner define invariantes, comandos e evolução compatível dos eventos que publica.
- Consumidores não dependem de tabelas, enums ou DTOs internos do producer.
- Contratos são identificados por `event_type` e `event_version` e passam por revisão do owner.
- Mudança de ownership exige ADR, migração explícita e período de compatibilidade.
