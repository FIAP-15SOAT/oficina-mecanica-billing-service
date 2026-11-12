# 🧪 Testes

## Índice

- [Unitários](#unitários)
- [Badge de cobertura](#badge-de-cobertura)
- [E2E](#e2e)
- [Rotas de teste nos E2E](#rotas-de-teste-nos-e2e)
- [Token de funcionário nos testes](#token-de-funcionário-nos-testes)
- [Stub do Work Order e do Inventory](#stub-do-work-order-e-do-inventory)
- [Stub do Mercado Pago](#stub-do-mercado-pago)
- [Contratos com outros serviços](#contratos-com-outros-serviços)
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

São 125 suítes e 1346 testes em `test/unit/`, que espelha `src/`. Cada classe é instanciada direto, com mocks tipados das factories de `test/helpers/` (`createMockLogger()`, `createMockMetrics()`, `createMockUnitOfWork()`, `createMockCache()`, `createMockWorkOrderGateway()`, `createMockInventoryCatalogGateway()`, `createMockPaymentProviderGateway()`, as factories de orçamento de `quote-mock.factory.ts` e as de cobrança de `payment-mock.factory.ts`), sem Nest DI e sem banco. Os casos de uso de orçamento e de cobrança rodam com os repositórios e os gateways mockados; a `QuoteWorkOrderPolicy`, o `QuoteItemValidator`, o `WorkOrderBalanceReader` e o `PaymentCloser` entram reais sobre os mocks. O adaptador do Mercado Pago é testado com o `HttpService` simulado, e o guard do webhook com assinaturas calculadas no teste.

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

São 13 suítes e 225 testes em `test/e2e/`, com containers reais por **Testcontainers 12**: PostgreSQL 18 (`postgres:18-alpine`) e Valkey 9.1 (`valkey/valkey:9.1`) em toda suíte, e LocalStack 4.14.0 nas suítes de mensageria. Precisa de Docker. A configuração está em `test/jest-e2e.json`, com prazo de 10 minutos por teste para a subida dos containers.

`setupTestApp()` (`test/helpers/test-app.helper.ts`) sobe o `INestApplication` pela mesma `configureApp()` do `main.ts`, aplica as migrations no PostgreSQL do teste e injeta a chave pública de teste. As opções ligam só o que a suíte usa:

| Opção | O que liga |
|---|---|
| `controllers` | Controllers de teste montados ao lado do `AppModule` (ver abaixo) |
| `captureLogs` | Captura as linhas JSON do log em `ctx.logCapture` |
| `captureBootstrap` | Implica `captureLogs` e guarda as linhas do boot em `ctx.logCapture.bootstrapLines()` |
| `withSwagger` | Registra o Swagger antes do `init()`, como o `main.ts` |
| `withMessaging` | Sobe o LocalStack com `app/localstack/init-topology.sh` e liga o relay e o consumidor reais |
| `internalServicesUrl` | URL do stub do Work Order e do Inventory; sem ela, `WORK_ORDER_SERVICE_URL` e `INVENTORY_SERVICE_URL` apontam para uma porta que recusa toda conexão |
| `mercadoPagoUrl` | URL do stub do Mercado Pago; sem ela, `MERCADOPAGO_API_URL` aponta para uma porta que recusa toda conexão. O access token e a chave do webhook são sempre os de teste |

| Suíte | O que cobre |
|---|---|
| `auth.e2e-spec.ts` | Guard global: sem token, token válido, HS256, outro emissor, outra audiência, expirado, token de cliente, papel insuficiente; health e Swagger sem token |
| `health.e2e-spec.ts` | `live` e `ready`, banco fora do ar, cache fora do ar (prontidão continua `200`), encerramento gracioso com requisição em voo, banco indisponível desde o boot e contrato publicado no OpenAPI |
| `logging.e2e-spec.ts` | Envelope, dicionário de campos fechado, saída do bootstrap, atribuição de ator e erro, proteção do payload, rota parametrizada e falhas do logger |
| `telemetry.e2e-spec.ts` | Correlação log-trace com um `TracerProvider` em memória |
| `messaging.e2e-spec.ts` | Outbox, relay, tópico, fila e consumidor reais (ver [Mensageria no E2E](#mensageria-no-e2e)) |
| `all-exceptions.filter.e2e-spec.ts` | Corpo de erro público para exceções não tratadas |
| `quote.e2e-spec.ts` | Rotas públicas de orçamento: autenticação, criação condicionada à OS, preço congelado, itens, envio com `billing.quote.sent` no outbox, aprovação com os outros orçamentos rejeitados e `billing.quote.approved`, rejeição com motivo, aprovações concorrentes (409), cache e listagens, inclusive o orçamento sem OS no Work Order, listado com `workOrder: null` |
| `internal-quote.e2e-spec.ts` | Rotas `/internal`: orçamento inicial e repetição, exclusão, detalhe e lista iguais às fixtures, decisão do cliente, `quote-usage` e ausência de token e de Swagger |
| `quote-messaging.e2e-spec.ts` | Comando `billing.quote.revert_approval` pela fila real: reversão para `SENT` com os orçamentos restaurados e `billing.quote.approval_reverted` lido na fila do Work Order, comando repetido e orçamento inexistente |
| `payment.e2e-spec.ts` | Rotas públicas de cobrança: criação com `billing.payment.requested` no outbox, segunda cobrança pendente (409), valor acima do saldo, zero e negativo (422), três casas decimais e notação exponencial, como `2e-7` (400), Mercado Pago fora do ar (503 sem gravar), duas criações concorrentes com uma só `PENDING`, listagem com filtros, detalhe, cada desfecho do cancelamento e falta de token |
| `payment-webhook.e2e-spec.ts` | Webhook: assinatura inválida (401, nada muda), order paga (`APPROVED` e `billing.payment.approved`), notificação repetida, order em processamento e logs sem access token, chave do webhook nem `x-signature` |
| `payment-messaging.e2e-spec.ts` | Comando `billing.payment.cancel` pela fila real: cancelamento com `billing.payment.failed` lido na fila do Work Order e comando confirmado sem efeito com o pagamento em andamento |
| `internal-payment.e2e-spec.ts` | Rotas `/internal` de cobranças e de saldo da OS, iguais às fixtures |

## Rotas de teste nos E2E

Os E2E do kit (autenticação, health, logging, telemetria e o filtro de exceções) precisam de uma rota autenticada, de uma rota que use o banco ou de uma rota que lance erro. Em vez de usar as rotas de orçamento, cada suíte declara no próprio arquivo os controllers de que precisa e os monta com `setupTestApp({ controllers: [...] })`.

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

Esse é o padrão permanente dos E2E do kit:

- O controller de teste passa pelo mesmo `AppModule`, pelo mesmo guard global, pelos mesmos filtros e pelo mesmo logging da aplicação. O que está sob teste é o kit, e ele fica igual.
- Cada suíte controla exatamente a rota de que precisa: a de logging monta controllers em `/api/auth` e em `/api/services` para exercitar as regras do kit para esses caminhos; a de health segura uma requisição em voo no acesso ao banco; a de exceções lança o erro que quer ver traduzido.
- As rotas de orçamento e de cobrança têm E2E próprios (`quote`, `internal-quote`, `quote-messaging`, `payment`, `payment-webhook`, `payment-messaging` e `internal-payment`). Os E2E do kit não dependem delas, e uma mudança de contrato de negócio não quebra um teste de logging.

Os controllers de teste existem só nos arquivos de `test/e2e/`: nenhum entra no `AppModule` nem no Swagger publicado.

## Token de funcionário nos testes

`test/helpers/staff-jwt.helper.ts` gera um par RS256 em tempo de execução (`generateKeyPairSync`, nunca um PEM versionado) e expõe `signTestStaffToken(claims, options?)`, que assina um access token com o `kid`, o emissor e a audiência de teste. `setupTestApp()` injeta a chave pública gerada em `STAFF_JWT_PUBLIC_KEY` antes de compilar o módulo, então o teste passa pelo mesmo caminho de configuração de produção.

## Stub do Work Order e do Inventory

As suítes de orçamento não sobem o Work Order nem o Inventory. `startInternalServicesStub()` (`test/helpers/internal-services-stub.ts`) abre um servidor HTTP local, numa porta livre, que responde `GET /internal/work-orders/:id`, `GET /internal/services/:id` e `GET /internal/parts-supplies/:id` a partir de mapas em memória:

| Situação | Resposta do stub |
| --- | --- |
| Id cadastrado com `stubWorkOrder()`, `stubService()` ou `stubPartSupply()` | `200 { data }`, com o corpo da fixture do dono e o id e os campos pedidos no teste (status da OS, preço) |
| Id em `failingIds` | `500`, para os casos de dono fora do ar (o Billing responde 503) |
| Outro id | `404` com o corpo de erro dos serviços |

A suíte passa `stub.url` em `setupTestApp({ internalServicesUrl })`, que a grava em `WORK_ORDER_SERVICE_URL` e `INVENTORY_SERVICE_URL` antes de compilar o módulo: o caminho é o mesmo de produção, com os gateways e o `InternalHttpClient` reais.

## Stub do Mercado Pago

As suítes de cobrança não chamam o Mercado Pago. `startMercadoPagoStub()` (`test/helpers/mercado-pago-stub.ts`) abre um servidor HTTP local, numa porta livre, que faz o papel da Orders API: `POST /v1/orders` cria a order `created` com o id `ORD000001`, `ORD000002`, ...; `GET /v1/orders/:id` a devolve; `POST /v1/orders/:id/cancel` a cancela quando ela está `created` e responde 409 nos outros status. O teste lê e muda o estado pelo próprio stub:

| Campo | Para quê |
| --- | --- |
| `orders` | Mudar o status de uma order (paga, expirada, em processamento) antes do webhook ou do cancelamento |
| `requests` | Conferir o que o Billing enviou: corpo da order, `X-Idempotency-Key` e quantas criações houve |
| `unavailable` | Responder 503 a tudo, para o caso do Mercado Pago fora do ar |
| `orderCreationDelayMs` | Segurar cada criação, para duas requisições concorrentes passarem pela conferência antes de qualquer commit |

A suíte passa `stub.url` em `setupTestApp({ mercadoPagoUrl })`. O webhook é assinado no teste por `signMercadoPagoWebhook()` (`test/helpers/mercado-pago-webhook.helper.ts`), que monta a `x-signature` como o Mercado Pago, com a chave de teste que `setupTestApp()` injeta.

O DAST usa outro stub, o serviço `mercadopago-stub` do override `app/docker-compose.dast.yml`, que roda `.zap/mercado-pago-stub.mjs` com as mesmas rotas e o link `https://localhost/checkout/<id>` ([CI/CD › Workflow de DAST](ci-cd.md#4-workflow-de-dast-dastyml)). O compose base não tem stub: ele lê a URL e as credenciais do `app/.env` ([Como executar localmente › Mercado Pago](local-setup.md#mercado-pago)).

## Contratos com outros serviços

As fixtures de `app/test/contracts/` fixam os corpos trocados com outros serviços, e cada uma começa por `$source`, o repositório e o caminho de onde veio.

| Pasta | Fixtures | Origem | Conferidas por |
| --- | --- | --- | --- |
| `contracts/` | `internal-quote.json`, `internal-quote-summary.json`, `internal-work-order-quotes.json`, `internal-quote-usage.json`, `internal-work-order-payments.json`, `internal-work-order-balance.json` | O próprio Billing (rotas `/internal` que ele serve) | `internal-quote.e2e-spec.ts` e `internal-payment.e2e-spec.ts`, que comparam a resposta real com a fixture; o Work Order e o Inventory copiam estas fixtures |
| `contracts/work-order/` | `internal-work-order.json` | Cópia da fixture de `GET /internal/work-orders/:id` do Work Order | Spec do `HttpWorkOrderGateway` e o stub dos E2E |
| `contracts/inventory/` | `internal-service.json`, `internal-part-supply.json` | Cópia literal das fixtures de `GET /internal/services/:id` e `GET /internal/parts-supplies/:id` do Inventory | Spec do `HttpInventoryCatalogGateway` e o stub dos E2E |

As cópias não são editadas aqui: quando o dono muda o contrato, a fixture é copiada de novo e o teste do gateway mostra o que quebrou. As fixtures do Inventory são provisórias: elas vêm do contrato que o Inventory publica para as rotas por id, ainda fora da `main` dele, e são recopiadas a cada mudança desse contrato.

## Mensageria no E2E

O LocalStack só sobe com `setupTestApp({ withMessaging: true })`, a opção das suítes `messaging.e2e-spec.ts`, `quote-messaging.e2e-spec.ts` e `payment-messaging.e2e-spec.ts`. Nas outras suítes, o relay e o consumidor são substituídos por versões vazias, e os eventos são conferidos na tabela `outbox`.

| Teste | O que prova |
|---|---|
| Ida e volta | Uma linha gravada no outbox sai pelo relay, passa pelo tópico e pela filter policy, volta pela fila `billing.fifo` e chega a um handler de teste com o envelope completo; a linha some do outbox |
| Rollback | Uma transação desfeita não deixa linha no outbox |
| Lock do relay | Com outra transação segurando o lock do relay, nada é publicado; depois do commit dela, a mensagem sai |
| Ordem do grupo | A falha da primeira mensagem de um grupo segura as seguintes do mesmo grupo |
| Sem handler | Uma mensagem válida de tipo sem handler, enviada direto à `billing.fifo`, é registrada (`messaging.message.unhandled`) e não é confirmada |
| Campos de log | As linhas da mensageria só emitem campos declarados no dicionário |

O handler de teste é registrado para `billing.payment.cancel` no `beforeAll`, com o `PaymentMessagingModule` trocado por um módulo vazio, porque o registro recusa um segundo handler para o mesmo tipo; assim a suíte do kit não depende dos handlers de orçamento e de cobrança. O caso "Sem handler" manda `inventory.stock.reserved` direto para a fila, porque a filter policy nunca o roteia para o Billing.

A suíte `quote-messaging.e2e-spec.ts` usa o handler real de `billing.quote.revert_approval`: publica o comando no tópico, espera o efeito no banco e lê a resposta `billing.quote.approval_reverted` na fila `work-order.fifo`, que a filter policy do LocalStack assina para esse tipo. A `payment-messaging.e2e-spec.ts` faz o mesmo com `billing.payment.cancel`: grava a order no stub do Mercado Pago e a cobrança no banco, publica o comando e lê `billing.payment.failed` na `work-order.fifo`; o caso do pagamento em andamento prova a confirmação sem efeito pela linha de log e pela `billing.fifo` vazia.

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

As requests ficam em quatro pastas, com testes de status e de envelope (`{ data }`, `{ data, pagination }` ou o corpo de erro):

| Pasta | Requests |
| --- | --- |
| Health | `GET /api/health/live` e `GET /api/health/ready`, sem token |
| Documentação | `GET /api/docs-json`, sem token |
| Orçamentos | Todas as rotas públicas de orçamento, em sequência: criar com e sem itens, incluir, alterar e remover serviço e peça, detalhar, enviar, rejeitar com e sem motivo, listar paginado, filtrar por OS e por status, listar os orçamentos da OS e aprovar; depois os conflitos com o orçamento aprovado (409), os recursos inexistentes (404), a validação (400) e a falta de token (401) |
| Cobranças | Todas as rotas públicas de cobrança, em sequência: as recusas da criação (valor acima do saldo e zero, 422; três casas decimais, 400; OS fora de `APPROVED` ou `COMPLETED`, 409), criar a cobrança, a segunda cobrança pendente (409), detalhar, listar paginado, filtrar por OS e status, filtro inválido (400), cancelar e cancelar de novo (409); depois a cobrança inexistente (404) e a falta de token (401) |

A collection manda `Authorization: Bearer {{authToken}}`, e só os casos 401, as rotas de saúde e o Swagger dispensam o token. O environment traz a `baseUrl` única e os ids de exemplo:

| Variável | Valor | O que precisa existir |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3002` | O Billing; só a origem, sem `/api`. Com o API Gateway implantado, troque só o `baseUrl` pela URL do gateway |
| `authToken` | vazio (secreto) | Um token de funcionário `ADMIN` assinado com o par cuja chave pública está no `.env` |
| `workOrderId` | vazio | Uma OS do Work Order local em `AWAITING_APPROVAL`, sem orçamento `APPROVED` no Billing |
| `paymentWorkOrderId` | vazio | Uma OS do Work Order local em `APPROVED`, com orçamento `APPROVED` de pelo menos 100,00 no Billing e sem cobrança `PENDING` |
| `serviceId`, `partSupplyId` | Ids canônicos do seed do Inventory (`Troca de óleo` e `FILT-OL-001`) | O Inventory local com o seed |

A pasta **Orçamentos** guarda os ids que cria nas variáveis da collection `quoteId` e `quoteIdForReject`, então roda na ordem. Ela termina com um orçamento `APPROVED` na OS, e a criação passa a responder 409 para essa OS: cada execução precisa de outra `workOrderId`. O Billing não muda o status da OS, então a mesma OS serve do começo ao fim.

A pasta **Cobranças** guarda o id da cobrança criada na variável `paymentId` e também roda na ordem. Ela cria uma cobrança de 100,00 e a cancela no fim, então a OS de `paymentWorkOrderId` termina sem cobrança pendente e serve para outra execução. O stack precisa chegar a um Mercado Pago: com as credenciais de teste no `app/.env`, a cobrança é criada no sandbox; sem elas, use o override do DAST, cujo stub do Mercado Pago responde a criação e o cancelamento ([Como executar localmente › Mercado Pago](local-setup.md#mercado-pago)).

Com o stack local do Billing no ar (Quick Start do README), o Work Order em `http://localhost:3000` e o Inventory em `http://localhost:3003`, a partir da raiz do repositório:

```bash
# Rodar a collection contra a API local, com o token e as OS da execução
npx --yes newman run collections/billing-collection.json -e collections/billing-environment.json --env-var authToken=<token ADMIN> --env-var workOrderId=<id da OS> --env-var paymentWorkOrderId=<id da OS aprovada>
```

## Mensagem de teste no ambiente

Para ver uma mensagem sair do outbox, passar pelo tópico e voltar pela fila do Billing, no log e no trace, insira uma linha na tabela `outbox`. O tipo `billing.payment.cancel` é roteado para a `billing.fifo`, e o handler do comando procura a cobrança: com o id de uma cobrança que não existe, ele falha a cada entrega, e o consumidor registra `messaging.message.failed` nas quatro primeiras e `messaging.message.dead_lettered` na quinta, quando a mensagem vai para a `billing-dlq.fifo`. Nenhuma cobrança muda e nenhum evento é publicado. Com `work_order_id` nulo, a mensagem forma um grupo só dela.

No stack do compose, a partir de `app/`:

```bash
# Gravar uma mensagem de teste no outbox
docker compose exec postgres psql -U postgres -d billing -c "INSERT INTO outbox (message_id, type, work_order_id, payload) VALUES (gen_random_uuid(), 'billing.payment.cancel', NULL, '{\"paymentId\": \"00000000-0000-4000-8000-000000000000\", \"reason\": \"teste\"}')"
```

No banco de um ambiente implantado, o mesmo `INSERT` vale em qualquer cliente SQL conectado ao banco do serviço. O `message_id` não tem valor padrão no banco, por isso o `gen_random_uuid()`.
