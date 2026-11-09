# Referência da API

> A fonte viva do contrato público é o **Swagger** em `http://localhost:3002/api/docs` (spec em `/api/docs-json`). Esta página é o resumo legível das rotas, inclusive das rotas internas, que ficam fora do Swagger.

## Índice

- [Acesso](#acesso)
- [Orçamentos](#orçamentos-apiquotes)
- [Orçamentos de uma ordem de serviço](#orçamentos-de-uma-ordem-de-serviço)
- [Ciclo de vida do orçamento](#ciclo-de-vida-do-orçamento)
- [Cobranças](#cobranças-apipayments)
- [Ciclo de vida da cobrança](#ciclo-de-vida-da-cobrança)
- [Webhook do Mercado Pago](#webhook-do-mercado-pago)
- [Rotas internas](#rotas-internas-internal)
- [Formato de resposta](#formato-de-resposta)
- [Erros](#erros)

## Acesso

- **Swagger:** `http://localhost:3002/api/docs`
- **Base URL:** `http://localhost:3002/api` (local). No cluster, o Billing responde no listener `8082` do NLB interno. Hoje o API Gateway publica do Billing `GET /health/billing`, `GET /docs/billing` e `POST /webhooks/mercadopago`, e encaminha `/api/quotes`, `GET /api/work-orders/{id}/quotes` e `/api/payments` ao Work Order.

Toda rota de `/api` exige `Authorization: Bearer <token>` com o token RS256 de **funcionário** emitido pelo Identity, validado localmente (assinatura, `kid`, `iss`, `aud`, `exp`, `typ = access` e `role`). Só as rotas de saúde e o Swagger respondem sem token. O webhook do Mercado Pago, fora de `/api`, também não leva token: ele é autenticado pela assinatura `x-signature`. Token de cliente, expirado ou assinado por outra chave responde **401**; papel sem permissão na rota responde **403**.

Os papéis são `ADMIN`, `ATTENDANT` e `MECHANIC`.

## Orçamentos (`/api/quotes`)

| Método | Rota | Descrição | Papéis | Respostas |
| --- | --- | --- | --- | --- |
| GET | `/` | Listar paginado (filtros `workOrderId` e `status`) | ADMIN, ATTENDANT, MECHANIC | 200, 400, 503 |
| POST | `/` | Criar orçamento de uma OS, com ou sem itens | ADMIN, ATTENDANT, MECHANIC | 201, 400, 404, 409, 422, 503 |
| GET | `/:id` | Detalhar, com os itens | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 503 |
| POST | `/:id/services` | Incluir serviço | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 422, 503 |
| PATCH | `/:id/services/:serviceId` | Alterar a quantidade de um serviço | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 503 |
| DELETE | `/:id/services/:serviceId` | Remover serviço | ADMIN, ATTENDANT, MECHANIC | 204, 400, 404, 409 |
| POST | `/:id/parts-supplies` | Incluir peça ou insumo | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 422, 503 |
| PATCH | `/:id/parts-supplies/:partSupplyId` | Alterar a quantidade de uma peça | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 503 |
| DELETE | `/:id/parts-supplies/:partSupplyId` | Remover peça | ADMIN, ATTENDANT, MECHANIC | 204, 400, 404, 409 |
| POST | `/:id/submissions` | Enviar ao cliente para decisão | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 503 |
| PATCH | `/:id` | Aprovar ou rejeitar | ADMIN, ATTENDANT | 200, 400, 404, 409, 503 |

### Criação

Corpo: `workOrderId` (UUID), `notes` (opcional, até 2000 caracteres) e, opcionais, `services[]` (`serviceId`, `quantity` inteiro ≥ 1) e `partsSupplies[]` (`partSupplyId`, `quantity` inteiro ≥ 1).

A criação lê a OS em `GET /internal/work-orders/:id` do Work Order e exige o status `IN_DIAGNOSIS`, `AWAITING_APPROVAL` ou `REJECTED`; com outro status responde **409**. Responde **409** também quando a OS já tem um orçamento `APPROVED` no banco do Billing: enquanto a reserva de estoque do orçamento aprovado está em andamento, a OS continua em `AWAITING_APPROVAL`, e um orçamento novo nessa janela poderia ser rejeitado e levar a OS a `REJECTED` no meio da reserva. Se a aprovação for revertida e o orçamento voltar a `SENT`, a criação volta a ser aceita.

Uma OS pode ter vários orçamentos ao mesmo tempo. Os itens seguem as regras abaixo; OS que o Work Order não conhece responde **404**.

### Itens

- Itens só mudam com o orçamento `PENDING`; fora dele, **409**.
- Cada serviço e cada peça são buscados no Inventory por id (`GET /internal/services/:id` e `GET /internal/parts-supplies/:id`), em paralelo. O item grava o preço lido nesse momento (`basePrice` do serviço, `salePrice` da peça) e o mantém mesmo que o preço mude depois no catálogo.
- Item que o Inventory não encontra responde **404**; Inventory fora do ar, com erro 5xx ou outro 4xx responde **503**, e nada é gravado.
- Peças exigem ao menos um serviço no orçamento, e um mesmo serviço ou peça não entra duas vezes: os dois casos respondem **409**.
- Item com preço não positivo no catálogo responde **422**. Quantidade zero ou não inteira responde **400**. Alterar ou remover item que não está no orçamento responde **404**.

Os totais (`servicesAmount`, `partsAmount`, `totalAmount`) são recalculados a cada mudança, em `DECIMAL(10,2)`.

### Envio (`POST /:id/submissions`)

O envio exige orçamento `PENDING` com ao menos um serviço e a OS em `IN_DIAGNOSIS`, `AWAITING_APPROVAL` ou `REJECTED`, sem orçamento `APPROVED`; caso contrário, **409**. Lê no Inventory os nomes dos itens para o evento: item que o Inventory não tem mais responde **404**, e o orçamento continua `PENDING`.

Aceito, o orçamento fica `SENT` com `sentAt` e `billing.quote.sent` vai para o outbox na mesma transação ([Mensageria](messaging.md)). **O Billing não manda e-mail**: o envio não responde mais 503 por falha de e-mail, porque quem avisa o cliente é o Work Order, ao receber o evento. O Billing também não muda o status da OS.

### Decisão (`PATCH /:id`)

Corpo: `status` (`APPROVED` ou `REJECTED`) e `reason`, obrigatório na rejeição. O autor da decisão (`decided_by`) é o usuário do token.

| Decisão | Exige | Efeito |
| --- | --- | --- |
| `APPROVED` | Orçamento `SENT`, OS em `AWAITING_APPROVAL` e nenhum outro orçamento `APPROVED` na OS | Orçamento `APPROVED`; os outros orçamentos `PENDING` e `SENT` da OS ficam `REJECTED` com `replaced_by_quote_id`; `billing.quote.approved` no outbox; tudo numa transação |
| `REJECTED` | Orçamento `SENT` e `reason` não vazio | Orçamento `REJECTED` com o motivo; `billing.quote.rejected` com `remainingSentCount` no outbox; o status da OS não é consultado |

A aprovação é síncrona e responde **200**: o efeito em outros serviços (reserva de estoque e mudança da OS) segue por mensagem. Os orçamentos rejeitados pela aprovação não publicam `billing.quote.rejected` e voltam ao status anterior se a aprovação for revertida ([Reversão](messaging.md#reversão-da-aprovação)).

Falta de motivo, ou motivo só com espaços, responde **400**. Orçamento fora de `SENT`, OS fora de `AWAITING_APPROVAL`, OS com outro orçamento `APPROVED` e duas aprovações simultâneas da mesma OS respondem **409** (concorrência em [Arquitetura](architecture.md#concorrência)). Token de `MECHANIC` responde **403**. Work Order fora do ar responde **503**. Cada desfecho está no [diagrama da aprovação](architecture.md#aprovação-síncrona).

### Resposta

O orçamento traz `id`, o resumo da OS em `workOrder`, `status`, `notes`, `sentAt`, `approvedAt`, `rejectedAt`, `servicesAmount`, `partsAmount`, `totalAmount`, `createdAt` e `updatedAt`. O detalhe acrescenta `services[]` (`id`, `name`, `description`, `quantity`, `unitPrice`, `totalPrice`) e `partsSupplies[]` (os mesmos campos mais `sku`, `partNumber`, `category` e `unit`).

- `workOrder` vem do Work Order a cada leitura (número, status, cliente, veículo, responsável e datas), lido uma vez por OS distinta e em paralelo; Work Order fora do ar responde **503**. Nas rotas que gravam, a OS é lida antes da gravação, então esse 503 não deixa nada gravado.
- Nome, descrição, SKU, unidade e categoria dos itens vêm do Inventory a cada leitura. Item que o Inventory não tem mais aparece com esses campos `null`, sem erro; Inventory fora do ar responde **503**. Preço e quantidade são sempre os do orçamento.

## Orçamentos de uma ordem de serviço

| Método | Rota | Descrição | Papéis | Respostas |
| --- | --- | --- | --- | --- |
| GET | `/api/work-orders/:id/quotes` | Orçamentos da OS, mais recentes primeiro (`{ data: [...] }`, sem paginação) | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 503 |

Responde **404** quando o Work Order não conhece a OS.

## Ciclo de vida do orçamento

| De | Para | Por |
| --- | --- | --- |
| — | `PENDING` | Criação (`POST /api/quotes` ou `POST /internal/quotes`) |
| `PENDING` | `SENT` | Envio |
| `SENT` | `APPROVED` | Aprovação do funcionário ou decisão do cliente |
| `SENT` | `REJECTED` | Rejeição com motivo, do funcionário ou do cliente |
| `PENDING`, `SENT` | `REJECTED` | Aprovação de outro orçamento da mesma OS (grava `replaced_by_quote_id`) |
| `APPROVED` | `SENT` ou `REJECTED` | Comando `billing.quote.revert_approval` |
| `REJECTED` (pela aprovação revertida) | `SENT` ou `PENDING` | Mesmo comando: volta a `SENT` se tem `sent_at`, senão a `PENDING` |

Só orçamento `PENDING` pode ser apagado, e só pela rota interna.

## Cobranças (`/api/payments`)

Uma cobrança pede ao cliente o pagamento de parte ou de todo o orçamento aprovado da OS, pelo Checkout Pro do Mercado Pago (a página de pagamento hospedada pelo Mercado Pago, que aceita Pix, cartão e boleto). O fluxo completo está em [Arquitetura › Cobranças com o Mercado Pago](architecture.md#cobranças-com-o-mercado-pago).

| Método | Rota | Descrição | Papéis | Respostas |
| --- | --- | --- | --- | --- |
| GET | `/` | Listar paginado, mais recentes primeiro (filtros `workOrderId` e `status`) | ADMIN, ATTENDANT, MECHANIC | 200, 400 |
| POST | `/` | Criar cobrança de uma OS e o link de pagamento | ADMIN, ATTENDANT, MECHANIC | 201, 400, 404, 409, 422, 503 |
| GET | `/:id` | Detalhar | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404 |
| POST | `/:id/cancellations` | Cancelar cobrança pendente | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 503 |

As rotas leem sempre o banco: as cobranças não usam cache, porque o status muda pelo webhook.

### Criação (`POST /api/payments`)

Corpo: `workOrderId` (UUID) e `amount` (número com até duas casas decimais).

| Conferência | Resposta |
| --- | --- |
| A OS, lida em `GET /internal/work-orders/:id` do Work Order, existe | **404** sem OS; **503** com o Work Order fora do ar |
| A OS está em `APPROVED` ou `COMPLETED` | **409** "Cobrança só pode ser criada com a Ordem de Serviço em um dos seguintes status: APPROVED ou COMPLETED. Status atual: ..." |
| A OS não tem cobrança `PENDING` | **409** "A ordem de serviço já tem uma cobrança pendente" |
| O valor é maior que zero | **422** "O valor da cobrança deve ser maior que zero" |
| O valor não passa do saldo (total do orçamento aprovado menos as cobranças `APPROVED`) | **422** "O valor da cobrança não pode ser maior que o saldo da ordem de serviço. Saldo atual: ..." |
| O Mercado Pago cria a order | **503** "Não foi possível criar a cobrança no Mercado Pago. Nada foi gravado; tente novamente" |

Nenhuma conferência que falha chama o Mercado Pago, e nenhuma falha grava a cobrança. Aceita, a cobrança nasce `PENDING`, `billing.payment.requested` vai para o outbox na mesma transação ([Mensageria](messaging.md#eventos-publicados)) e a resposta é **201** com o link de pagamento em `checkoutUrl`. O Billing não manda o link ao cliente: o evento leva o link ao Work Order. Duas criações simultâneas para a mesma OS deixam uma só cobrança `PENDING`, e a outra responde **409**.

### Cancelamento (`POST /api/payments/:id/cancellations`)

Sem corpo. Cancela a order no Mercado Pago e responde pelo resultado:

| Situação | Cobrança | Resposta |
| --- | --- | --- |
| Cobrança `PENDING` e order cancelada | `CANCELLED`, com `billing.payment.failed` (`CANCELLED`) | **200** com a cobrança |
| Cancelamento recusado e order já encerrada sem pagamento (`expired`, `canceled` ou `failed`) | `EXPIRED`, `CANCELLED` ou `REJECTED`, com `billing.payment.failed` e o motivo | **200** com a cobrança |
| Cancelamento recusado e order paga (`processed`) | `APPROVED`, com `billing.payment.approved` | **409** "A cobrança não pode ser cancelada porque já foi paga" |
| Cancelamento recusado com pagamento iniciado pelo cliente e não concluído | Continua `PENDING`, sem evento | **409** "A cobrança não pode ser cancelada enquanto o pagamento iniciado pelo cliente no provedor de pagamento não for concluído. Ela será encerrada quando esse pagamento for confirmado ou expirar" |
| Cobrança fora de `PENDING` | Não muda | **409** "Cobrança só pode ser cancelada no status PENDING. Status atual: ..." |
| Cobrança inexistente | — | **404** |
| Mercado Pago fora do ar | Não muda | **503** "Não foi possível cancelar a order no Mercado Pago. Nada mudou; tente novamente" ou "Não foi possível consultar a order no Mercado Pago. Tente novamente" |

O mesmo cancelamento atende ao comando `billing.payment.cancel` ([Mensageria › Comandos consumidos](messaging.md#comandos-consumidos)).

### Resposta

A cobrança traz `id`, `workOrderId`, `checkoutId` (o id da order no Mercado Pago), `amount`, `status`, `checkoutUrl` (o link de pagamento), `expiresAt`, `createdAt` e `updatedAt`. A listagem usa o envelope paginado; criação, detalhe e cancelamento, `{ data }`.

## Ciclo de vida da cobrança

| De | Para | Por |
| --- | --- | --- |
| — | `PENDING` | Criação (`POST /api/payments`) |
| `PENDING` | `APPROVED` | Webhook com a order paga, ou cancelamento recusado com a order paga |
| `PENDING` | `EXPIRED` | Webhook com a order expirada, ou cancelamento recusado com a order expirada |
| `PENDING` | `CANCELLED` | Cancelamento pela rota ou pelo comando `billing.payment.cancel`, ou webhook com a order cancelada |
| `PENDING` | `REJECTED` | Webhook com a order recusada (`failed`), ou cancelamento recusado com a order recusada |

`APPROVED`, `EXPIRED`, `CANCELLED` e `REJECTED` são finais: nenhuma rota, mensagem ou notificação muda uma cobrança encerrada. Estorno e chargeback de uma cobrança `APPROVED` são só registrados no log (`payment.checkout_reversed`).

## Webhook do Mercado Pago

| Método | Rota | Quem chama | Respostas |
| --- | --- | --- | --- |
| POST | `/webhooks/mercadopago?data.id=<id da order>` | Mercado Pago, a cada mudança de uma order | 200, 401, 409, 503 |

Fora do prefixo `api`, sem token e fora do Swagger. O cabeçalho `x-signature` (`ts=<instante>,v1=<hash>`) é validado com a chave secreta do webhook sobre o `data.id` em minúsculas, o `x-request-id` e o `ts`; assinatura inválida, `ts` ausente e `data.id` ausente respondem **401** "Assinatura do webhook inválida". Válida, o Billing consulta a order e encerra a cobrança `PENDING` se a order estiver encerrada; responde **200** depois de processar, inclusive para uma notificação repetida, de cobrança encerrada ou de order desconhecida, que não mudam nada. **503** (Mercado Pago fora do ar na consulta) e **409** (outra escrita encerrou a cobrança ao mesmo tempo) fazem o Mercado Pago repetir a notificação. O corpo enviado pelo Mercado Pago não é lido: só a order consultada vale.

## Rotas internas (`/internal`)

Sem o prefixo `api`, sem token e fora do Swagger: só o tráfego dentro do cluster alcança, e o API Gateway não as publica. Toda chamada leva `x-request-id` e `traceparent`. Ids que não são UUID respondem **400**.

| Método | Rota | Quem chama | Descrição | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/internal/quotes` | Work Order, na abertura da OS | Cria o orçamento inicial `PENDING` | 201, 400, 404, 409, 422, 503 |
| DELETE | `/internal/quotes/:id` | Work Order, compensando a abertura | Apaga um orçamento `PENDING` | 204, 404, 409 |
| GET | `/internal/quotes/:id` | Work Order | Detalhe com itens, total, `decidedBy` e `rejectionReason` | 200, 404, 503 |
| GET | `/internal/work-orders/:workOrderId/quotes` | Work Order | Orçamentos da OS, sem itens | 200 |
| POST | `/internal/quotes/:id/decisions` | Work Order, pela decisão do cliente | Aprova ou rejeita | 200, 400, 404, 409, 503 |
| GET | `/internal/services/:serviceId/quote-usage` | Inventory, antes de excluir um serviço | Se algum orçamento usa o serviço | 200 |
| GET | `/internal/parts-supplies/:partSupplyId/quote-usage` | Inventory, antes de excluir uma peça | Se algum orçamento usa a peça | 200 |
| GET | `/internal/work-orders/:workOrderId/payments` | Work Order | Cobranças da OS, em qualquer status, da mais antiga para a mais nova | 200 |
| GET | `/internal/work-orders/:workOrderId/balance` | Work Order | Saldo da OS | 200 |

As respostas internas trazem `workOrderId`, `decidedBy` e `rejectionReason` no lugar do resumo `workOrder` da rota pública, e não consultam o Work Order: assim o Work Order chama o Billing sem que o Billing chame o Work Order de volta. Os itens do detalhe interno trazem os dados de exibição do Inventory, como na rota pública, então o detalhe responde **503** com o Inventory fora do ar.

### Orçamento inicial (`POST /internal/quotes`)

Recebe o mesmo corpo da criação pública. Cria o orçamento `PENDING` sem consultar o Work Order, porque a OS ainda não foi gravada, e valida os itens no Inventory (404 para item ausente, 503 com o Inventory fora do ar, 409 para peça sem serviço ou item repetido).

É idempotente pelo `workOrderId`: se a OS já tem orçamento, devolve o mais antigo com **201**, sem criar outro. Na abertura só a própria abertura conhece aquele id, então a consulta basta, sem índice único. A resposta é `{ data }` com o orçamento sem itens.

### Exclusão (`DELETE /internal/quotes/:id`)

Só apaga orçamento `PENDING` (**409** fora dele) e responde **204**. Orçamento inexistente responde **404**, que o Work Order trata como já apagado.

### Decisão do cliente (`POST /internal/quotes/:id/decisions`)

Corpo: `action` (`approve` ou `reject`), `reason` (até 500 caracteres, obrigatório na rejeição) e `decidedBy` (UUID do cliente). Repassa aos mesmos casos de uso da rota do funcionário, **sem** consultar a OS: o Work Order já conferiu o vínculo do cliente e a OS. Orçamento fora de `SENT` ou OS com outro orçamento `APPROVED` respondem **409**. A resposta é o detalhe interno, com os itens lidos no Inventory antes da decisão; Inventory fora do ar responde **503** e a decisão não é gravada. Cada desfecho está no [diagrama da decisão do cliente](architecture.md#aprovação-síncrona).

### Uso de item (`quote-usage`)

Responde `{ "data": { "inUse": true } }` quando algum orçamento, em qualquer status, tem o serviço ou a peça; senão `inUse` é `false`.

### Cobranças e saldo da OS

`GET /internal/work-orders/:workOrderId/payments` responde `{ data: [...] }`, sem paginação, com as cobranças no formato da rota pública. `GET /internal/work-orders/:workOrderId/balance` responde os valores em texto com duas casas, para quem lê não somar em ponto flutuante:

```json
{ "data": { "approvedTotal": "500.00", "paidTotal": "100.00", "balance": "400.00" } }
```

`approvedTotal` é o total do orçamento `APPROVED` da OS (zero sem orçamento aprovado), `paidTotal` a soma das cobranças `APPROVED` e `balance` a diferença. Uma cobrança `PENDING` não entra no `paidTotal`. OS sem orçamento nem cobrança responde a lista vazia e o saldo zero, sem 404: o Billing não consulta o Work Order nessas rotas.

### Fixtures de contrato

As respostas internas estão versionadas em [`app/test/contracts/`](../app/test/contracts/), e os E2E comparam a resposta real com elas:

| Fixture | Rota |
| --- | --- |
| `internal-quote.json` | `GET /internal/quotes/:id` (orçamento `APPROVED`) |
| `internal-quote-summary.json` | `POST /internal/quotes` |
| `internal-work-order-quotes.json` | `GET /internal/work-orders/:workOrderId/quotes` |
| `internal-quote-usage.json` | `GET /internal/{services,parts-supplies}/:id/quote-usage` |
| `internal-work-order-payments.json` | `GET /internal/work-orders/:workOrderId/payments` |
| `internal-work-order-balance.json` | `GET /internal/work-orders/:workOrderId/balance` |

As rotas que o Billing consome têm as fixtures dos donos copiadas em `app/test/contracts/work-order/` e `app/test/contracts/inventory/` ([Testes](testing.md#contratos-com-outros-serviços)).

## Formato de resposta

Recurso único em `{ data: ... }`; lista paginada em `{ data: [...], pagination: { totalRecords, totalPages, page, limit } }`. `page` tem padrão 1 e mínimo 1; `limit` tem padrão 10, mínimo 1 e máximo 100. Valores monetários saem como número (`219.9`), gravados em `DECIMAL(10,2)`; só o saldo interno sai em texto com duas casas. Datas saem em ISO 8601 com fuso. As rotas de saúde (`/api/health/live` e `/api/health/ready`) devolvem só `{ "status": "ok" }` ou `{ "status": "unavailable" }`.

## Erros

O corpo é `{ "statusCode": 409, "error": "Conflict", "message": "..." }`, com mensagem em português e sem detalhe de infraestrutura.

| Status | Quando |
| --- | --- |
| 400 | Formato inválido no corpo, na query ou no id (`message` em lista na validação de DTO); rejeição sem motivo |
| 401 | Sem token, token inválido ou token de cliente; no webhook, assinatura inválida |
| 403 | Papel sem permissão na rota |
| 404 | Orçamento, item do orçamento, cobrança, OS (no Work Order) ou item do catálogo (no Inventory) inexistente |
| 409 | Regra de negócio violada (status do orçamento, da cobrança ou da OS, orçamento `APPROVED` na OS, peça sem serviço, item repetido, cobrança pendente na OS, cancelamento de cobrança paga ou em pagamento) e conflito de versão em escrita concorrente; repita a chamada depois de reler |
| 422 | Dado de domínio inválido, como item com preço não positivo no catálogo ou cobrança com valor zero ou acima do saldo |
| 503 | Work Order ou Inventory fora do ar, sem resposta em 2 s ou com erro inesperado; Mercado Pago sem credencial, sem resposta em 5 s ou com erro inesperado; nada é gravado |
