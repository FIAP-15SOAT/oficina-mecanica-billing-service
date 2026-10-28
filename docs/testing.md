# 🧪 Testes

## Índice

- [Unitários](#unitários)
- [Badge de cobertura](#badge-de-cobertura)
- [E2E](#e2e)
- [Rotas de teste nos E2E](#rotas-de-teste-nos-e2e)
- [Token de funcionário nos testes](#token-de-funcionário-nos-testes)
- [Mensageria no E2E](#mensageria-no-e2e)
- [Telemetria: o que o Jest não instrumenta](#telemetria-o-que-o-jest-não-instrumenta)
- [Postman / Newman](#postman--newman)
- [Mensagem de teste no ambiente](#mensagem-de-teste-no-ambiente)

Todos os comandos rodam a partir de `app/`.

## Unitários

```bash
# Rodar os testes unitários
npm test

# Rodar com o relatório de cobertura
npm run test:cov
```

Os scripts rodam o Jest como `node --experimental-vm-modules node_modules/jest/bin/jest.js`, nunca `npx jest`: os pacotes do NestJS 12 são só ESM, e sem a flag as suítes que importam `@nestjs/*` falham com `Must use import to load ES Module`. Para um arquivo só: `npm test -- <caminho>`.

São 59 suítes e 828 testes em `test/unit/`, que espelha `src/`. Cada classe é instanciada direto, com mocks tipados das factories de `test/helpers/` (`createMockLogger()`, `createMockUnitOfWork()`, `createMockCache()` e outras), sem Nest DI e sem banco.

A cobertura é **100% em lines, statements, functions e branches**, e o piso está em `package.json` → `jest.coverageThreshold`: o `npm run test:cov`, e com ele o job `Unit Tests` do CI, falha quando qualquer métrica cai abaixo de 100%. A coleta abrange todo `src/`, menos `*.module.ts`, `main.ts`, `otel.ts`, `*.enums.ts`, `*.config.ts`, `*.exception.ts`, `*.dto.ts` e `prisma.service.ts`. O `otel.ts` é coberto pelo `npm run test:smoke`, num processo real, no job `Build` do CI.

O SonarQube Cloud recebe só o `lcov` unitário: o E2E não alcança alguns ramos por HTTP (falha do próprio logger, bootstrap fora do harness) e baixaria a cobertura sem dizer nada novo.

## Badge de cobertura

O badge do README mostra a cobertura unitária. Para conferir o valor, gere o resumo da cobertura e leia as quatro métricas:

```bash
# Rodar a cobertura gerando só o resumo em JSON
npm run test:cov -- --coverageReporters=json-summary

# Ler as quatro métricas do resumo
node -e "const t = require('./coverage/coverage-summary.json').total; console.log(['lines', 'statements', 'functions', 'branches'].map((k) => k + ' ' + t[k].pct + '%').join(', '))"
```

A saída esperada é `lines 100%, statements 100%, functions 100%, branches 100%`. Como o `coverageThreshold` exige 100%, o badge só muda se o piso mudar.

## E2E

```bash
# Rodar os testes E2E
npm run test:e2e

# Rodar com cobertura
npm run test:e2e:cov
```

São 6 suítes e 93 testes em `test/e2e/`, com containers reais por **Testcontainers 12**: PostgreSQL 18 (`postgres:18-alpine`) e Valkey 9.1 (`valkey/valkey:9.1`) em toda suíte, e LocalStack 4.14.0 na suíte de mensageria. Precisa de Docker. A configuração está em `test/jest-e2e.json`, com prazo de 10 minutos por teste para a subida dos containers.

`setupTestApp()` (`test/helpers/test-app.helper.ts`) sobe o `INestApplication` pela mesma `configureApp()` do `main.ts`, aplica as migrations no PostgreSQL do teste e injeta a chave pública de teste. As opções ligam só o que a suíte usa:

| Opção | O que liga |
|---|---|
| `controllers` | Controllers de teste montados ao lado do `AppModule` (ver abaixo) |
| `captureLogs` | Captura as linhas JSON do log em `ctx.logCapture` |
| `captureBootstrap` | Implica `captureLogs` e guarda as linhas do boot em `ctx.logCapture.bootstrapLines()` |
| `withSwagger` | Registra o Swagger antes do `init()`, como o `main.ts` |
| `withMessaging` | Sobe o LocalStack com `app/localstack/init-topology.sh` e liga o relay e o consumidor reais |

| Suíte | O que cobre |
|---|---|
| `auth.e2e-spec.ts` | Guard global: sem token, token válido, HS256, outro emissor, outra audiência, expirado, token de cliente, papel insuficiente; health e Swagger sem token |
| `health.e2e-spec.ts` | `live` e `ready`, banco fora do ar, cache fora do ar (prontidão continua `200`), encerramento gracioso com requisição em voo, banco indisponível desde o boot e contrato publicado no OpenAPI |
| `logging.e2e-spec.ts` | Envelope, dicionário de campos fechado, saída do bootstrap, atribuição de ator e erro, proteção do payload, rota parametrizada e falhas do logger |
| `telemetry.e2e-spec.ts` | Correlação log-trace com um `TracerProvider` em memória |
| `messaging.e2e-spec.ts` | Outbox, relay, tópico, fila e consumidor reais (ver [Mensageria no E2E](#mensageria-no-e2e)) |
| `all-exceptions.filter.e2e-spec.ts` | Corpo de erro público para exceções não tratadas |

## Rotas de teste nos E2E

O Billing ainda não tem rota de negócio: a API expõe só os health checks e o Swagger. Os E2E do kit (autenticação, health, logging, telemetria e o filtro de exceções) precisam de uma rota autenticada, de uma rota que use o banco ou de uma rota que lance erro. Por isso cada suíte declara no próprio arquivo os controllers de que precisa e os monta com `setupTestApp({ controllers: [...] })`.

```ts
@Controller('probe')
class ProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }
}

ctx = await setupTestApp({ controllers: [ProbeController] });

await request(ctx.httpServer)
  .get('/api/probe')
  .set('Authorization', `Bearer ${signTestStaffToken(CLAIMS)}`)
  .expect(200);
```

Esse é o padrão permanente dos E2E do kit, não um arranjo até as rotas de negócio chegarem:

- O controller de teste passa pelo mesmo `AppModule`, pelo mesmo guard global, pelos mesmos filtros e pelo mesmo logging da aplicação. O que está sob teste é o kit, e ele fica igual.
- Cada suíte controla exatamente a rota de que precisa: a de logging monta controllers em `/api/auth` e em `/api/services` para exercitar as regras do kit para esses caminhos; a de health segura uma requisição em voo no acesso ao banco; a de exceções lança o erro que quer ver traduzido.
- As rotas de negócio, quando chegarem, ganham E2E próprios por domínio. Os E2E do kit não passam a depender delas, e uma mudança de contrato de negócio não quebra um teste de logging.

Os controllers de teste existem só nos arquivos de `test/e2e/`: nenhum entra no `AppModule` nem no Swagger publicado.

## Token de funcionário nos testes

`test/helpers/staff-jwt.helper.ts` gera um par RS256 em tempo de execução (`generateKeyPairSync`, nunca um PEM versionado) e expõe `signTestStaffToken(claims, options?)`, que assina um access token com o `kid`, o emissor e a audiência de teste. `setupTestApp()` injeta a chave pública gerada em `STAFF_JWT_PUBLIC_KEY` antes de compilar o módulo, então o teste passa pelo mesmo caminho de configuração de produção.

## Mensageria no E2E

O LocalStack só sobe com `setupTestApp({ withMessaging: true })`, a opção da suíte `messaging.e2e-spec.ts`. Nas outras suítes, o relay e o consumidor são substituídos por versões vazias.

| Teste | O que prova |
|---|---|
| Ida e volta | Uma linha gravada no outbox sai pelo relay, passa pelo tópico e pela filter policy, volta pela fila `billing.fifo` e chega a um handler de teste com o envelope completo; a linha some do outbox |
| Rollback | Uma transação desfeita não deixa linha no outbox |
| Lock do relay | Com outra transação segurando o lock do relay, nada é publicado; depois do commit dela, a mensagem sai |
| Ordem do grupo | A falha da primeira mensagem de um grupo segura as seguintes do mesmo grupo |
| Sem handler | Uma mensagem válida de tipo sem handler é registrada (`messaging.message.unhandled`) e não é confirmada |
| Campos de log | As linhas da mensageria só emitem campos declarados no dicionário |

O handler de teste é registrado para `billing.quote.revert_approval` no `beforeAll`; `billing.payment.cancel`, o outro tipo roteado para a fila, fica sem handler para o caso "Sem handler".

## Telemetria: o que o Jest não instrumenta

A auto-instrumentação do OpenTelemetry não funciona sob Jest: o `jest-runtime` tem registro de módulos próprio e não passa pelo carregador do Node, onde a instrumentação engancha. Um teste que afirmasse algo sobre spans de instrumentação ficaria verde sem verificar nada.

| Onde | O que |
|---|---|
| Unitário | Funções puras e classes: exclusão das probes, atributos de span sanitizados, resource, registry e adaptador de métricas |
| E2E | Correlação log-trace, que é um `mixin` do logger e não uma instrumentação |
| `npm run test:smoke` | Num processo real, no job `Build` do CI: o interruptor desligado sem carregar o SDK, configuração inválida sem impedir o boot, `OTEL_LOG_LEVEL` sem poluir o stdout e o `express` instrumentado pelo hook ESM |

Nenhuma suíte define `OTEL_EXPORTER_OTLP_ENDPOINT`, então o SDK não inicia em teste algum.

## Postman / Newman

A collection e o environment estão em `collections/`. Importe `collections/billing-collection.json` e `collections/billing-environment.json` no Postman e selecione o environment **Billing API**.

`baseUrl` é só a origem, sem `/api`, e vale `http://localhost:3002`, a porta do Billing no host. Com o API Gateway implantado, troque só o `baseUrl` pela URL do gateway.

As requests cobrem as rotas públicas de hoje, cada uma com teste de status `200`: `GET /api/health/live`, `GET /api/health/ready` e `GET /api/docs-json`.

Com o stack local no ar (Quick Start do README), a partir da raiz do repositório:

```bash
# Rodar a collection contra a API local
npx --yes newman run collections/billing-collection.json -e collections/billing-environment.json
```

## Mensagem de teste no ambiente

Para ver uma mensagem sair do outbox, passar pelo tópico e voltar pela fila do Billing, no log e no trace, insira uma linha na tabela `outbox`. O tipo `billing.payment.cancel` é roteado para a `billing.fifo` e não tem handler, então o consumidor registra `messaging.message.unhandled` a cada entrega e, na quinta, `messaging.message.dead_lettered`; a mensagem vai para a `billing-dlq.fifo`. Com `work_order_id` nulo, a mensagem forma um grupo só dela.

No stack do compose, a partir de `app/`:

```bash
# Gravar uma mensagem de teste no outbox
docker compose exec postgres psql -U postgres -d billing -c "INSERT INTO outbox (message_id, type, work_order_id, payload) VALUES (gen_random_uuid(), 'billing.payment.cancel', NULL, '{\"paymentId\": \"00000000-0000-4000-8000-000000000000\", \"reason\": \"teste\"}')"
```

No banco de um ambiente implantado, o mesmo `INSERT` vale em qualquer cliente SQL conectado ao banco do serviço. O `message_id` não tem valor padrão no banco, por isso o `gen_random_uuid()`.
