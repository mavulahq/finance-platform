# Contratos regulatórios

Estado: **Initial v1 contracts**

RFC: [RFC-0002](rfc-0002-ledger-core-closeout.md)

Os contratos canônicos ficam em [`contracts/regulatory`](../../contracts/regulatory/)
e são validados por `pnpm contracts:check`. Eles definem fronteiras de dados;
não representam, por si só, um serviço de reporting nem uma submissão aceite
por uma autoridade.

## Contratos v1

- `regulatory.transaction_record@1`: partes, contas, executor, beneficiários
  efetivos, contraparte, método de instrução, dinheiro, correlação, retenção e
  base legal de um registo financeiro reconstituível.
- `regulatory.aml_decision@1`: alerta, transações relacionadas, risco, decisão,
  responsável tipado como analista AML ou compliance officer, fundamento,
  comunicação, retenção e base legal.
- `regulatory.export_record@1`: tipo e período do export, geração, hash do
  conteúdo, contrato versionado do conteúdo, entrega e referência da autoridade.

Todos os exemplos usam dados sintéticos e classificação `restricted`. O
catálogo possui versão própria e cada mudança incompatível exige um novo schema
versionado. Implementações devem aplicar autorização need-to-know, RLS,
integridade do conteúdo e retenção conforme a política institucional aprovada.

Os requisitos regulatórios e períodos de conservação precisam de validação
jurídica antes de uso em produção ou submissão oficial.
