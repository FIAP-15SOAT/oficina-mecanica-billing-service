# ADR 0003: E2E com Testcontainers: PostgreSQL, Valkey e LocalStack

## Status

Aceito — 2026-10-27

## Contexto

O kit do Billing depende de três serviços externos: o PostgreSQL (dados, outbox e o lock do relay), o Valkey (cache) e o SNS/SQS (mensageria). Vários comportamentos que importam só existem com o serviço real: a transação que grava o estado e o outbox juntos, o `pg_try_advisory_xact_lock` que deixa uma réplica publicar por vez, a filter policy que roteia a mensagem para a `billing.fifo`, a mensagem sem confirmação que volta a ser entregue, a prontidão que continua `200` com o cache fora do ar. Um mock reproduz o que a gente acha que o serviço faz, não o que ele faz.

## Decisão

Os testes E2E sobem containers reais por **Testcontainers 12**, um conjunto por suíte, descartado no fim:

- **PostgreSQL 18** (`postgres:18-alpine`) em toda suíte, com as migrations aplicadas como em produção;
- **Valkey 9.1** (`valkey/valkey:9.1`) em toda suíte, porque o cache é global no `AppModule`;
- **LocalStack 4.14.0** só na suíte de mensageria (`setupTestApp({ withMessaging: true })`), com o mesmo `app/localstack/init-topology.sh` do compose, o relay e o consumidor reais. Nas outras suítes, relay e consumidor são substituídos por versões vazias.

A aplicação sobe pela mesma `configureApp()` do `main.ts`. As versões das imagens são as mesmas do compose e do ambiente.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Mockar o Prisma, o Valkey e o SDK da AWS no E2E | Mais rápido e sem Docker, mas não prova transação, lock, filter policy nem redelivery, e repete o que o unitário já cobre | — |
| Banco e filas compartilhados e persistentes | Sem custo de subida, mas o estado se acumula entre execuções e pessoas e exige disciplina de limpeza | — |
| LocalStack em toda suíte | Configuração única, mas cada suíte pagaria a subida do LocalStack sem usar a mensageria | — |
| LocalStack 2026.x com token | Versão mais nova, mas exige conta e token para cada pessoa e para o CI | Precisar de recurso que só a versão nova tenha |
| SNS e SQS reais numa conta de teste | Fidelidade total, mas o CI passaria a depender de credencial e de uma conta da AWS | — |

## Consequências

### Positivas

- Regressão de migration, de transação, de roteamento de mensagem e de prontidão aparece no PR.
- Qualquer máquina ou runner com Docker roda a suíte, sem provisionar nada.
- Cada suíte começa de um estado limpo por construção.

### Negativas e limites

- A suíte é mais lenta: cada uma sobe os próprios containers, e o prazo por teste é de 10 minutos.
- Exige Docker em todo ambiente que rode o E2E.
- O LocalStack emula o SNS e o SQS: uma diferença de comportamento contra a AWS real não aparece no teste.

## Referências

- [Testes › E2E](../testing.md#e2e)
- [Testes › Mensageria no E2E](../testing.md#mensageria-no-e2e)
- [Testcontainers for Node.js](https://node.testcontainers.org/)
- [LocalStack](https://docs.localstack.cloud/)
