# RFC-0002: Ledger Core Production Closeout

Status: **Proposed**

Date: 2026-07-10

Discussion: [RFC-0002](https://github.com/orgs/mavulahq/discussions/4)

## Resumo

Esta RFC define o fechamento de produção do `ledger-core` como fonte da verdade financeira do MAVULA. O objetivo é tornar APIs, autorização, isolamento por tenant, idempotência, reversões, auditoria e contratos públicos seguros para operações institucionais.

RFC-0002 continua a linha da RFC-0001: PostgreSQL, ledger e serviços de comando permanecem fontes da verdade. Outbox/Inbox continuam a ser usados para integração, projeções e auditoria operacional. Esta RFC não introduz Event Sourcing financeiro.

A identidade institucional deixa de pertencer ao `ledger-core`. O novo módulo `identity-access` passa a ser owner de instituições, filiais, operadores, credenciais, sessões, roles e políticas de acesso. O `ledger-core` conserva apenas a referência local ao tenant necessária para RLS e relações financeiras.

## Relação com RFC-0001

RFC-0001 definiu fronteiras de contexto, ownership, CQRS seletivo, Outbox/Inbox, catálogo de eventos e as primeiras fatias verticais de eventos. RFC-0002 fecha o lado de comando do `ledger-core` e a fronteira de identidade para que integrações e futuras superfícies operacionais possam depender de contratos estáveis.

Eventos de domínio continuam regidos por RFC-0001. Novos eventos só podem ser ativados quando tiverem payload schema, producer, consumer idempotente quando aplicável, testes e observabilidade.

## Problema

O `ledger-core` já contém as bases de produto, ledger, lending, transações, workflow, audit trail, Outbox/Inbox, projeções e APIs HTTP. A autenticação atual é apenas uma fundação transitória e não deve tornar o ledger owner de identidade. Ainda faltam controles necessários para produção:

- identidade e autorização institucionais separadas das invariantes financeiras;
- DTOs e validação runtime explícita para comandos de escrita;
- isolamento por tenant aplicado de forma repetível em migrations, Prisma e conexões PostgreSQL reutilizadas;
- ciclo completo de contas, reversões, correções e aprovações operacionais;
- idempotência durável para side effects de workflows;
- contratos OpenAPI versionados para APIs públicas e partner;
- taxonomia de auditoria financeira e contratos de reporte regulatório.

## Objetivos

- Introduzir `identity-access` como owner de identidade institucional e políticas de acesso.
- Garantir que APIs públicas rejeitam requests sem autenticação, tenant e permissão adequados.
- Tornar o isolamento por tenant verificável por teste, migration e runtime.
- Fechar lifecycle financeiro crítico sem delegar invariantes ao `workbench`.
- Garantir que mutações financeiras são idempotentes, auditáveis e reversíveis por workflows controlados.
- Publicar contratos HTTP versionados em documentação dedicada antes de expor superfícies institucionais.
- Formalizar `AuditTrailEvent.stage` e contratos regulatórios sem transformar auditoria em Event Sourcing.
- Preparar interoperabilidade COBOL para sistemas financeiros legados através de uma fronteira dedicada.

## Não objetivos

- Transformar ledger, lending ou audit trail em Event Sourcing.
- Transferir ownership financeiro para `identity-access`, `workbench`, `settlements` ou `legacy-connectors`.
- Implementar M-Pesa, e-Mola, bank-transfer adapters ou settlement files.
- Implementar `console`, mobile ou intelligence.
- Implementar o runtime completo dos novos módulos nesta revisão documental.
- Criar novos eventos ativos fora dos critérios da RFC-0001.

## Ownership e módulos

### `identity-access`

`identity-access` é o authorization server e OpenID Provider do MAVULA. É responsável por:

- instituições, filiais, operadores e vínculos institucionais;
- credenciais, autenticadores, sessões e revogação;
- roles, permissões e políticas de acesso;
- emissão de tokens e claims assinadas;
- trilho de autenticação e alterações de acesso.

O contrato deve seguir OpenID Connect e OAuth 2.0 Security Best Current Practice. Authorization Code com PKCE é o fluxo de operadores; Client Credentials é reservado para comunicação entre serviços. Roles nunca são aceitas de um payload de login.

Claims mínimas:

- `iss`, `sub`, `aud`, `iat`, `exp` e `jti`;
- `tenant_id` e `institution_id`;
- `branch_id` quando o acesso estiver limitado a uma filial;
- `roles` e `permissions` efetivas.

O `ledger-core` atua como resource server: valida assinatura, issuer, audience, expiração e claims, mas não autentica credenciais nem atribui roles. O endpoint de login provisório existente será descontinuado após a entrada do novo issuer.

### `developer-docs`

`developer-docs` é a superfície dedicada para OpenAPI versionado, referências geradas, onboarding, sandbox, webhooks e runbooks públicos. Os contratos são gerados a partir das fontes versionadas dos módulos e não incluem endpoints internos.

### `legacy-connectors`

`legacy-connectors` é a fronteira de interoperabilidade para sistemas financeiros legados. COBOL será utilizado para copybooks, registos fixed-width, ficheiros batch e transformações compatíveis com core banking legado.

O módulo deve usar contratos versionados, checksums, idempotência, reconciliação e rejeição determinística de registos inválidos. Não pode escrever diretamente nas tabelas de `ledger-core` ou `identity-access`.

## Fatias de entrega

### 1. Identidade e segurança de API

Requisitos mínimos:

- fundação de `identity-access` com issuer, discovery, JWKS, tokens e revogação;
- Authorization Code com PKCE para operadores e Client Credentials para serviços;
- `Authorization` obrigatório para APIs públicas;
- tenant e instituição derivados de claims confiáveis, sem fallback público;
- guards globais ou explícitos por controller;
- RBAC por operação de leitura, escrita, aprovação, conformidade e administração;
- DTOs versionados e validação runtime para payloads públicos;
- migração controlada do login provisório do `ledger-core`.

O conjunto mínimo de roles institucionais é:

- `institution_admin`: administra instituição, filiais, operadores e atribuições de acesso; não aprova operações financeiras por defeito;
- `operations_maker`: cria e submete operações;
- `operations_checker`: aprova ou rejeita operações, sem aprovar operações próprias;
- `compliance_officer`: gere diligência, alertas, decisões AML e reportes regulatórios;
- `auditor`: consulta e exporta informação em modo somente leitura.

As políticas devem impedir autoaprovação e preservar a independência entre execução, autorização, compliance e auditoria.

### 2. Isolamento de tenant e RLS

Tenant isolation deve ser uma propriedade testável do runtime, não apenas uma convenção de serviços.

Requisitos mínimos:

- RLS em migrations repetíveis;
- role de aplicação sem bypass;
- tenant context aplicado dentro da mesma transação que executa a query;
- correspondência validada entre token, tenant e instituição;
- testes que provam que conexões reutilizadas não vazam tenant context;
- cobertura cross-tenant para HTTP, Prisma, jobs, logs e exports.

### 3. Operações financeiras controladas

O `ledger-core` deve fechar o ciclo operacional mínimo de contas e correções financeiras.
Na ordem executável, esta capacidade é entregue em duas fatias: account lifecycle
na terceira e ajustes financeiros na quarta.

Requisitos mínimos:

- APIs de account get, balance, statement, freeze, close e status transition;
- reversões e correções com maker-checker, actor, motivo e audit trail;
- trial balance balanceado após lifecycle, retry, reversal e concorrência;
- nenhuma mutação financeira executada diretamente por evento de pagamento;
- audit trail obrigatório para operações aprovadas, rejeitadas, postadas, revertidas, falhadas e configuradas.

### 4. Idempotência, contratos e observabilidade

Esta capacidade começa na quinta fatia executável. Os contratos regulatórios
foram antecipados na quarta fatia porque o novo audit trail e os ajustes
financeiros precisavam de fronteiras de dados explícitas; receipts duráveis,
OpenAPI e observabilidade adicional permanecem na quinta.

Requisitos mínimos:

- `Idempotency-Key` obrigatório para writes financeiros e workflows com side effects;
- receipts duráveis por tenant, operação e idempotency key;
- OpenAPI versionado para APIs públicas e partner, publicado em `developer-docs`;
- endpoints internos excluídos da superfície pública;
- métricas e logs estruturados para falhas de auth, RLS, idempotência, reversões e contratos inválidos;
- contratos de reporte regulatório versionados e separados do audit trail operacional.

### 5. Interoperabilidade legada

Esta fatia começa apenas depois da estabilização dos contratos públicos.

Requisitos mínimos:

- copybooks e layouts fixed-width versionados;
- importação e exportação batch em `legacy-connectors`;
- checksum, idempotência, reconciliação e relatórios de rejeição;
- fixtures e golden files sem dados pessoais reais;
- integração exclusiva por API, comando, evento ou ficheiro aprovado.

## Interfaces públicas

RFC-0002 deve estabilizar contratos HTTP para:

- Identity: discovery, JWKS, authorization, token, revocation e identidade efetiva do operador;
- Accounts: create, list, get, balance, statement, freeze, close e status transition;
- Lending: application, approval, rejection, disbursement, repayment, reversal e correction references;
- Products, rules, schemas e workflows: DTOs validados e permissões explícitas;
- Internal worker callbacks: API interna separada e protegida por credencial de serviço;
- Regulatory exports: schema, período, versão, hash, actor e estado de entrega;
- Legacy files: layout, versão, checksum, correlation id e resultado de processamento.

Headers obrigatórios nos resource servers:

- `Authorization`;
- `X-Tenant-ID` apenas como selector compatível e sempre validado contra as claims;
- `Idempotency-Key` para writes financeiros e side effects.

## Auditoria

O draft anterior da RFC-0002 sobre `AuditTrailEvent.phase` passa a ser tratado como parte desta RFC.

### Classificação técnica

`AuditTrailEvent` recebe o novo campo tipado `stage: AuditTrailStage`:

- `REQUESTED`
- `VALIDATED`
- `EVALUATED`
- `AUTHORIZED`
- `POSTED`
- `CONFIGURED`
- `DISPATCHED`

`phase` permanece apenas para leitura durante uma janela de compatibilidade e deixa de ser escrito. `action` continua a identificar a operação auditada. Resultado é uma dimensão separada; `REJECTED`, `FAILED` e `REVERSED` não são etapas.

Cada registo deve identificar, quando aplicável, actor, role efetiva, instituição, filial, ação, entidade, resultado, motivo, timestamp, correlation id, causation id, origem e referência de aprovação.

### Requisitos regulatórios

O audit trail genérico não deve concentrar toda a informação regulatória nem expor informação AML em metadata livre. Devem existir contratos separados para:

- registo regulatório de transação: origem e destino dos fundos, executor, beneficiário efetivo, contraparte, forma de instrução, contas, montante, moeda e data;
- decisão AML: alerta, classificação de risco, analista ou OCOS, fundamento, decisão e referência de comunicação;
- export regulatório: tipo, período, schema version, geração, content hash, entrega e referência da autoridade.

Registos sujeitos às regras de BC/FT/FP devem ser conservados por pelo menos dez anos. Registos de investigações em curso permanecem até confirmação formal de encerramento. Acesso a alertas e operações suspeitas segue need-to-know e deve impedir divulgação indevida.

Fontes regulatórias primárias:

- [Aviso n.º 10/GBM/2024](https://www.bancomoc.mz/media/2xud3l5t/avisos-n%C3%BAmeros-10-e-11-gbm-2024-de-30-de-agosto.pdf), artigos 10-20, 86-92, 96 e 98;
- [Lei n.º 14/2023](https://bancomoc.mz/media/jmalaodu/lei-n-%C2%BA-14_2023-aml-cft-pf.pdf), artigo 43, alterada pela [Lei n.º 3/2024](https://www.bancomoc.mz/media/gmilvpu3/lei-n-%C2%BA-3_2024-de-22-mar%C3%A7o-altera%C3%A7%C3%B5es-lei-aml_cft_cfp-e-lei-n-%C2%BA-4_2024-de-22-de-mar%C3%A7o-altera%C3%A7%C3%B5es-a-lei-de-repress%C3%A3o-e-combate-ao-terrorismo.pdf);
- [Aviso n.º 11/GGBM/99](https://www.bancomoc.mz/media/bdtm1w20/8_252_tb1_pt_aviso_11_ggbm_99.pdf), artigos 5 e 6;
- [Lei n.º 20/2020](https://bancomoc.mz/media/eo1fg0lb/lei_20-2020_31_de_dezembro_-_lei_das_institui%C3%A7%C3%B5es_de_cr%C3%A9dito_e_sociedades_financeiras-licsf-1.pdf);
- [Decreto n.º 50/2024](https://www.bancomoc.mz/media/jcdnvi0r/decreto-50-2024-11-de-julho-regulamento-da-lei-das-institui%C3%A7%C3%B5es-de-cr%C3%A9dito-e-sociedades-financeiras.pdf);
- [Aviso n.º 12/GBM/2024](https://www.bancomoc.mz/media/n4ylurov/aviso-n-%C2%BA-12-gbm-2024-regulamento-da-central-de-registo-de-cr%C3%A9dito.pdf).

Esta definição técnica não substitui parecer jurídico nem validação formal com instituições licenciadas e autoridades competentes.

## Ordem de implementação

1. Fundação de `identity-access`, guards, claims, DTOs e remoção de fallback público.
2. RLS transacional e testes cross-tenant.
3. Account lifecycle e contratos públicos mínimos.
4. Reversões, correções, maker-checker e `AuditTrailEvent.stage`.
5. Receipts duráveis de idempotência.
6. OpenAPI versionado em `developer-docs`.
7. `legacy-connectors` sobre contratos estabilizados.

## Estado de implementação

A primeira fatia entrega a fundação de identidade e segurança de API:

- `identity-access` como authorization server OIDC com discovery, JWKS, Authorization Code com PKCE, credenciais de serviço por `private_key_jwt`, revogação e access tokens de cinco minutos;
- ownership durável de instituições, filiais, operadores, credenciais, memberships, roles, clientes OAuth e artefactos OIDC em PostgreSQL;
- claims institucionais e permissões derivadas do estado persistido, sem roles fornecidas pelo request;
- `ledger-core` e `workbench` como resource servers com validação de issuer, audience, assinatura PS256, tenant e permissões;
- chamadas internas do `workbench` autenticadas por Client Credentials, sem shared API key;
- contrato JSON Schema de access-token claims, configuração por `.env`, manifests Kubernetes e CI obrigatória.

A segunda fatia entrega isolamento transacional de tenant:

- baseline Prisma controlada e migration repetível para políticas RLS;
- role `ledger_core_app` sem bypass, credenciais de runtime separadas das credenciais de migration e remoção do role legado com password fixa;
- vínculo local entre tenant e instituição no primeiro uso de claims assinadas, com rejeição de correspondências posteriores divergentes;
- contexto PostgreSQL aplicado por `SET LOCAL` dentro da mesma transação que executa cada query;
- Inbox, Outbox, projeções, jobs, logs e exports restritos ao tenant autenticado, sem contexto global `*`;
- testes PostgreSQL com role real, `WITH CHECK` e reutilização de conexão com pool limitado.

A terceira fatia entrega account lifecycle e contratos públicos mínimos:

- contas com referência de cliente e produto, moeda, versionamento e estados `ACTIVE`, `FROZEN` e `CLOSED`;
- APIs tenant-scoped de criação, listagem, consulta, saldo e extrato;
- subledger append-only em `account_entries`, suportado por journal entries balanceados e valores decimais serializados como string;
- pedidos duráveis de transição com estados `PENDING_APPROVAL`, `APPLIED`, `REJECTED` e `FAILED`;
- maker-checker para freeze, unfreeze e close, com permissão explícita de aprovação e bloqueio de autoaprovação;
- política de posting que bloqueia débitos em contas congeladas, permite créditos e bloqueia qualquer posting em contas encerradas;
- encerramento restrito a contas ativas com saldo zero;
- audit trail gravado na mesma transação da decisão e do posting;
- migrations com RLS e privilégios append-only, testes de lifecycle, concorrência, isolamento e ausência de efeitos financeiros diretos por eventos de pagamento.

A quarta fatia entrega ajustes financeiros controlados e classificação técnica de auditoria:

- pedidos duráveis de reversão e correção para transactions e journal entries, com original imutável;
- correção atómica por journal de reversão seguido de journal substituto, incluindo postings do subledger;
- suporte a reversão e correção dos efeitos de pagamento e desembolso em lending, com bloqueio quando existem efeitos financeiros posteriores;
- maker-checker, bloqueio de autoaprovação, decisões idempotentes e estados `PENDING_APPROVAL`, `APPLIED`, `REJECTED` e `FAILED`;
- `AuditTrailEvent.stage`, `result` e `source` tipados, actor roles, instituição, filial, motivo, correlação, causação e referência de aprovação;
- campo legado `phase` disponível apenas para leitura, sem novas escritas no runtime;
- eventos ativos `ledger.adjustment_posted` v1 e `lending.adjustment_applied` v1, com Outbox transacional e rebuild das projeções;
- contratos JSON Schema v1 separados para transaction record regulatório, decisão AML e export regulatório;
- migration com RLS, alvo ativo único por tenant, lançamentos `REVERSAL`/`CORRECTION` e audit trail append-only;
- testes de concorrência, rejeição, trial balance, pagamentos, desembolsos, efeitos posteriores, API, projeções e PostgreSQL/RLS.

Receipts duráveis para todos os side effects, OpenAPI em `developer-docs`, métricas adicionais e conectores legados permanecem nas fatias seguintes, na ordem definida acima.

## Plano de testes

- `pnpm --filter @mavula/identity-access test`
- `pnpm --filter @mavula/ledger-core test`
- `pnpm --filter @mavula/ledger-core test:e2e`
- `pnpm --filter @mavula/ledger-core test:financial`
- `pnpm --filter @mavula/legacy-connectors test`
- `pnpm --filter @mavula/ledger-core guardian:check`
- `pnpm contracts:check`

Cenários obrigatórios:

- request sem auth, com issuer inválido, audience inválida ou token expirado é rejeitado;
- roles fornecidas pelo request não alteram permissões;
- role insuficiente e autoaprovação são rejeitadas;
- auditor não executa mutações;
- tenant A não lê nem altera dados do tenant B;
- RLS aplica dentro de transações e conexões reutilizadas;
- replay com mesma idempotency key não duplica mutação financeira;
- reversão ou correção mantém trial balance balanceado;
- novas escritas usam `stage` e dados legados com `phase` continuam legíveis;
- OpenAPI cobre endpoints públicos e não expõe endpoints internos;
- ficheiros COBOL duplicados ou inválidos não produzem efeitos financeiros duplicados.

## Critérios de aceite

- `identity-access` é o único owner de credenciais, sessões, roles e políticas institucionais.
- Todas as APIs públicas de escrita usam DTOs validados, auth, tenant e RBAC.
- Toda mutação financeira pública exige idempotency key e registra audit trail.
- Tenant isolation é provado por teste automatizado em HTTP, Prisma e jobs.
- Maker-checker impede autoaprovação e preserva segregação de funções.
- Reversões e correções preservam invariantes financeiras.
- OpenAPI versionado existe em `developer-docs` para APIs públicas e partner.
- A classificação de audit trail usa `stage` e contratos regulatórios separados.
- COBOL integra por `legacy-connectors` sem acesso direto aos stores dos owners.

## Decisões

1. `AuditTrailEvent` recebe `stage`; `phase` permanece somente para leitura durante a migração.
2. Roles mínimas: `institution_admin`, `operations_maker`, `operations_checker`, `compliance_officer` e `auditor`.
3. OpenAPI é publicado em documentação dedicada, sob `developer-docs`.
4. A implementação segue a ordem das fatias definida nesta RFC.
5. Requisitos regulatórios exigem retenção, reconstituição, segregação, confidencialidade e contratos de export adicionais; detalhes AML permanecem fora de metadata genérica.
6. COBOL entra por `legacy-connectors`, não pelo runtime de identidade nem pelo ledger.
