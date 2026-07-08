# ADR-0003: Versionamento de eventos

- Estado: Accepted
- Data: 2026-06-21
- Decisão: 2026-06-27
- RFC: [RFC-0001](https://github.com/orgs/mavulahq/discussions/1)

## Contexto

Producers e consumidores evoluem em ritmos diferentes. Alterações incompatíveis sem versão coordenada quebram processamento, replay e reconstrução de projeções.

## Decisão

Cada contrato é identificado pelo par `event_type` e `event_version`. A versão é um inteiro iniciado em `1`.

Campos opcionais podem ser adicionados sem incrementar a versão. Remover ou renomear campos, mudar tipos, tornar um campo obrigatório ou alterar semântica exige nova versão. Consumers devem tolerar campos opcionais desconhecidos e rejeitar versões não suportadas de forma observável.

Um evento ativo possui payload schema versionado. A versão anterior permanece disponível durante uma janela de migração declarada, e deprecação ou remoção exige revisão do owner.

## Consequências

- O catálogo mantém estado, owner e versões suportadas.
- Testes de contrato validam exemplos e compatibilidade antes da publicação.
- Mudanças incompatíveis podem exigir publicação paralela e migração de consumers.
