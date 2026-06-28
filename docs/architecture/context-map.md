# Mapa de contextos do Fluxo

Estado: **Accepted**

Decisão: 2026-06-27

RFC: [RFC-0001](https://github.com/orgs/getfluxo-io/discussions/1)

Este documento define as fronteiras de negócio iniciais do Fluxo. As fronteiras são orientadas por linguagem, invariantes e ownership de dados; não reproduzem simplesmente a estrutura atual de pastas.

## Regras de fronteira

- Cada agregado possui um único contexto responsável por alterar o seu estado.
- Outros contextos integram por API, comando ou evento e nunca escrevem diretamente nas tabelas do owner.
- Uma operação financeira aplica autorização, tenant e invariantes no lado de comando, dentro da transação adequada.
- Eventos públicos expõem factos de negócio estáveis, não modelos internos nem dados pessoais desnecessários.
- Jobs descrevem trabalho a executar; eventos de domínio descrevem factos que já aconteceram.

## Contextos

| Contexto               | Owner     | Dados e agregados controlados                                                      | Estado atual                                                                                  |
| ---------------------- | --------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Tenant & Identity      | `fengine` | tenant, identidade institucional, utilizadores, funções e políticas de acesso      | Tenant middleware, auth foundation e RLS existem; identidade de produção permanece incompleta |
| Product Configuration  | `fengine` | produtos, regras, taxas, limites, schemas e versões publicadas                     | Produtos, regras e schemas existem; publicação e versionamento imutável são lacunas           |
| Accounts & Ledger      | `fengine` | contas, transações financeiras, plano de contas e journal entries                  | Implementado como fonte da verdade financeira                                                 |
| Lending                | `fengine` | empréstimos, decisões, desembolsos, calendários e reembolsos                       | Lifecycle principal implementado                                                              |
| Payments               | `fpay`    | instruções, callbacks de providers, liquidação, reconciliação e reversões externas | Contratos de adapter existem; integrações de providers e reconciliação permanecem planeadas   |
| Workflow Configuration | `fengine` | definições de workflow, triggers, schemas e políticas de execução                  | Definição e execução básica existem no `fengine`                                              |
| Automation Execution   | `fwk`     | jobs, schedules, tentativas, dead-letter queues e receipts de execução             | BullMQ, retries, schedules, métricas e callbacks implementados                                |
| Audit & Reporting      | `fengine` | trilho de auditoria canônico e factos necessários para projeções e relatórios      | Audit trail existe; read models e reporting dedicados são planeados                           |

`finfra` é uma capacidade de plataforma que provisiona e opera PostgreSQL, Redis, Kubernetes, observabilidade e secrets. Não é um bounded context de negócio e não possui agregados financeiros.

## Relações

```mermaid
flowchart LR
    TI["Tenant & Identity"] --> PC["Product Configuration"]
    TI --> AL["Accounts & Ledger"]
    TI --> LN["Lending"]
    PC --> AL
    PC --> LN
    LN --> AL
    LN --> PY["Payments"]
    PY --> AL
    WC["Workflow Configuration"] --> AE["Automation Execution"]
    AE --> WC
    AL --> AR["Audit & Reporting"]
    LN --> AR
    PY --> AR
```

As setas representam integração por contrato, não permissão de escrita direta.

## Fronteiras transitórias

- `fengine` continua a coordenar transações de desembolso e pagamento até `fpay` possuir o seu modelo e adapters. A extração não pode transferir ownership do ledger.
- `fengine` possui definições de workflow; `fwk` possui apenas o estado operacional de jobs. Um job BullMQ não é um evento de domínio.
- O audit trail registra ações atuais. A Fase 2 introduz vertical slices de domain events para `products.configuration_published`, `lending.loan_disbursed` e `lending.payment_posted`; os demais eventos continuam propostos até terem implementação equivalente.
