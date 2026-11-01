# Referência da API

> A fonte viva do contrato público é o **Swagger** em `http://localhost:3002/api/docs` (spec em `/api/docs-json`). Esta página é o resumo legível das rotas, inclusive das rotas internas, que ficam fora do Swagger.

## Índice

- [Acesso](#acesso)
- [Orçamentos](#orçamentos-apiquotes)
- [Orçamentos de uma ordem de serviço](#orçamentos-de-uma-ordem-de-serviço)
- [Ciclo de vida do orçamento](#ciclo-de-vida-do-orçamento)
- [Rotas internas](#rotas-internas-internal)
- [Formato de resposta](#formato-de-resposta)
- [Erros](#erros)

## Acesso

- **Swagger:** `http://localhost:3002/api/docs`
- **Base URL:** `http://localhost:3002/api` (local). No cluster, o Billing responde no listener `8082` do NLB interno. Hoje o API Gateway publica do Billing `GET /health/billing` e `GET /docs/billing`, e encaminha `/api/quotes` e `GET /api/work-orders/{id}/quotes` ao Work Order.

Toda rota de `/api` exige `Authorization: Bearer <token>` com o token RS256 de **funcionário** emitido pelo Identity, validado localmente (assinatura, `kid`, `iss`, `aud`, `exp`, `typ = access` e `role`). Só as rotas de saúde e o Swagger respondem sem token. Token de cliente, expirado ou assinado por outra chave responde **401**; papel sem permissão na rota responde **403**.

Os papéis são `ADMIN`, `ATTENDANT` e `MECHANIC`.

## Orçamentos (`/api/quotes`)

| Método | Rota | Descrição | Papéis | Respostas |
| --- | --- | --- | --- | --- |
| GET | `/` | Listar paginado (filtros `workOrderId` e `status`) | ADMIN, ATTENDANT, MECHANIC | 200, 400, 503 |
| POST | `/` | Criar orçamento de uma OS, com ou sem itens | ADMIN, ATTENDANT, MECHANIC | 201, 400, 404, 409, 422, 503 |
| GET | `/:id` | Detalhar, com os itens | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 503 |
| POST | `/:id/services` | Incluir serviço | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 422, 503 |
| PATCH | `/:id/services/:serviceId` | Alterar a quantidade de um serviço | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409 |
| DELETE | `/:id/services/:serviceId` | Remover serviço | ADMIN, ATTENDANT, MECHANIC | 204, 400, 404, 409 |
| POST | `/:id/parts-supplies` | Incluir peça ou insumo | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409, 422, 503 |
| PATCH | `/:id/parts-supplies/:partSupplyId` | Alterar a quantidade de uma peça | ADMIN, ATTENDANT, MECHANIC | 200, 400, 404, 409 |
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

- `workOrder` vem do Work Order a cada leitura (número, status, cliente, veículo, responsável e datas), lido uma vez por OS distinta e em paralelo; Work Order fora do ar responde **503**.
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

As respostas internas trazem `workOrderId`, `decidedBy` e `rejectionReason` no lugar do resumo `workOrder` da rota pública, e não consultam o Work Order: assim o Work Order chama o Billing sem que o Billing chame o Work Order de volta. Os itens do detalhe interno trazem os dados de exibição do Inventory, como na rota pública, então o detalhe responde **503** com o Inventory fora do ar.

### Orçamento inicial (`POST /internal/quotes`)

Recebe o mesmo corpo da criação pública. Cria o orçamento `PENDING` sem consultar o Work Order, porque a OS ainda não foi gravada, e valida os itens no Inventory (404 para item ausente, 503 com o Inventory fora do ar, 409 para peça sem serviço ou item repetido).

É idempotente pelo `workOrderId`: se a OS já tem orçamento, devolve o mais antigo com **201**, sem criar outro. Na abertura só a própria abertura conhece aquele id, então a consulta basta, sem índice único. A resposta é `{ data }` com o orçamento sem itens.

### Exclusão (`DELETE /internal/quotes/:id`)

Só apaga orçamento `PENDING` (**409** fora dele) e responde **204**. Orçamento inexistente responde **404**, que o Work Order trata como já apagado.

### Decisão do cliente (`POST /internal/quotes/:id/decisions`)

Corpo: `action` (`approve` ou `reject`), `reason` (até 500 caracteres, obrigatório na rejeição) e `decidedBy` (UUID do cliente). Repassa aos mesmos casos de uso da rota do funcionário, **sem** consultar a OS: o Work Order já conferiu o vínculo do cliente e a OS. Orçamento fora de `SENT` ou OS com outro orçamento `APPROVED` respondem **409**. A resposta é o detalhe interno, com os itens lidos no Inventory; Inventory fora do ar responde **503**. Cada desfecho está no [diagrama da decisão do cliente](architecture.md#aprovação-síncrona).

### Uso de item (`quote-usage`)

Responde `{ "data": { "inUse": true } }` quando algum orçamento, em qualquer status, tem o serviço ou a peça; senão `inUse` é `false`.

### Fixtures de contrato

As respostas internas estão versionadas em [`app/test/contracts/`](../app/test/contracts/), e os E2E comparam a resposta real com elas:

| Fixture | Rota |
| --- | --- |
| `internal-quote.json` | `GET /internal/quotes/:id` (orçamento `APPROVED`) |
| `internal-quote-summary.json` | `POST /internal/quotes` |
| `internal-work-order-quotes.json` | `GET /internal/work-orders/:workOrderId/quotes` |
| `internal-quote-usage.json` | `GET /internal/{services,parts-supplies}/:id/quote-usage` |

As rotas que o Billing consome têm as fixtures dos donos copiadas em `app/test/contracts/work-order/` e `app/test/contracts/inventory/` ([Testes](testing.md#contratos-com-outros-serviços)).

## Formato de resposta

Recurso único em `{ data: ... }`; lista paginada em `{ data: [...], pagination: { totalRecords, totalPages, page, limit } }`. `page` tem padrão 1 e mínimo 1; `limit` tem padrão 10, mínimo 1 e máximo 100. Valores monetários saem como número (`219.9`), gravados em `DECIMAL(10,2)`. Datas saem em ISO 8601 com fuso. As rotas de saúde (`/api/health/live` e `/api/health/ready`) devolvem só `{ "status": "ok" }` ou `{ "status": "unavailable" }`.

## Erros

O corpo é `{ "statusCode": 409, "error": "Conflict", "message": "..." }`, com mensagem em português e sem detalhe de infraestrutura.

| Status | Quando |
| --- | --- |
| 400 | Formato inválido no corpo, na query ou no id (`message` em lista na validação de DTO); rejeição sem motivo |
| 401 | Sem token, token inválido ou token de cliente |
| 403 | Papel sem permissão na rota |
| 404 | Orçamento, item do orçamento, OS (no Work Order) ou item do catálogo (no Inventory) inexistente |
| 409 | Regra de negócio violada (status do orçamento ou da OS, orçamento `APPROVED` na OS, peça sem serviço, item repetido) e conflito de versão em escrita concorrente; repita a chamada depois de reler |
| 422 | Dado de domínio inválido, como item com preço não positivo no catálogo |
| 503 | Work Order ou Inventory fora do ar, sem resposta em 2 s ou com erro inesperado; nada é gravado |
