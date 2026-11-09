# Banco de dados

PostgreSQL 18, só deste serviço, definido em [`app/prisma/schema.prisma`](../app/prisma/schema.prisma) e versionado em [`app/prisma/migrations/`](../app/prisma/migrations/). O serviço não tem seed: as migrations só criam o schema.

## Tabelas

| Tabela | Conteúdo | Chaves e índices |
| --- | --- | --- |
| `quotes` | Orçamento: `work_order_id`, `status`, `notes`, `services_amount`, `parts_amount`, `total_amount` (`DECIMAL(10,2)`), `version`, `sent_at`, `approved_at`, `rejected_at`, `decided_by`, `rejection_reason`, `replaced_by_quote_id`, `created_at`, `updated_at` | PK `id` (UUID); índices `(work_order_id, status)` e `(status)` |
| `quote_services` | Serviço do orçamento: `quantity`, `unit_price` e `total_price` (`DECIMAL(10,2)`) | PK `(quote_id, service_id)`; índice `(service_id)`; FK `CASCADE` para `quotes` |
| `quote_part_supplies` | Peça ou insumo do orçamento: `quantity`, `unit_price` e `total_price` (`DECIMAL(10,2)`) | PK `(quote_id, part_supply_id)`; índice `(part_supply_id)`; FK `CASCADE` para `quotes` |
| `payments` | Cobrança: `work_order_id`, `amount` (`DECIMAL(10,2)`), `status`, `checkout_id` (o id da order no Mercado Pago, até 64 caracteres), `checkout_url` (o link de pagamento), `expires_at`, `version`, `created_at`, `updated_at` | PK `id` (UUID, gerado pelo Billing antes de criar a order); único em `checkout_id`; único parcial em `(work_order_id) WHERE status = 'PENDING'` |
| `outbox` | Mensagens a publicar, apagadas pelo relay depois de publicadas | PK `id` (`BIGSERIAL`); único em `message_id`; ver [Mensageria](messaging.md) |

Enums: `QuoteStatus` (`PENDING`, `SENT`, `APPROVED`, `REJECTED`) e `PaymentStatus` (`PENDING`, `APPROVED`, `EXPIRED`, `CANCELLED`, `REJECTED`).

## Colunas de decisão e de restauração

| Coluna | Gravada por | Uso |
| --- | --- | --- |
| `decided_by` | Aprovação e rejeição (o funcionário do token ou o cliente da decisão repassada); apagada pela reversão | O Work Order lê o autor em `GET /internal/quotes/:id` quando a reserva confirma |
| `rejection_reason` | Rejeição com motivo | Volta em `GET /internal/quotes/:id` e no evento `billing.quote.rejected` |
| `replaced_by_quote_id` | Aprovação de outro orçamento da OS, nos orçamentos `PENDING` e `SENT` que ela rejeita | Diz quais orçamentos a reversão daquela aprovação restaura; apagada na restauração |
| `sent_at` | Só o envio | Diz o status de antes da rejeição pela aprovação: com `sent_at` o orçamento volta a `SENT`, sem ele a `PENDING` |

Nada volta a `PENDING` depois do envio, então `sent_at` basta para restaurar o status anterior, sem uma coluna que repetiria essa informação. Um orçamento rejeitado pelo cliente tem `rejection_reason` e não tem `replaced_by_quote_id`, e por isso a reversão não o toca.

## Regras garantidas pelo banco e pelo acesso

- **Ids de outros serviços sem chave estrangeira.** `work_order_id` (em `quotes` e em `payments`), `service_id`, `part_supply_id` e `decided_by` pertencem ao Work Order, ao Inventory e ao Identity: aqui são só UUIDs, e o serviço nunca lê nem replica as entidades deles. Os dados de exibição vêm do dono a cada leitura.
- **Vários orçamentos por OS.** Não há unicidade em `work_order_id`: a OS pode ter orçamentos concorrentes. O índice `(work_order_id, status)` atende à lista da OS e à consulta de orçamento `APPROVED` feita na criação, no envio e na aprovação.
- **Preço congelado.** `unit_price` é o preço lido no Inventory na inclusão do item; `total_price` e os totais do orçamento são recalculados pela entidade e gravados juntos.
- **Concorrência otimista.** Toda atualização de `quotes` filtra pela `version` lida e a incrementa; se outra transação gravou antes, a escrita não acha a linha e a API responde **409**. A aprovação e a reversão gravam todos os orçamentos que alteram em ordem de id, para duas transações sobre a mesma OS falharem pela versão em vez de entrar em deadlock ([Arquitetura](architecture.md#concorrência)).
- **Itens apagados com o orçamento.** As FKs `CASCADE` removem os itens quando a rota interna apaga um orçamento `PENDING`.
- **Uso de item.** Os índices `(service_id)` e `(part_supply_id)` atendem às rotas `quote-usage`, que respondem se algum orçamento, em qualquer status, usa o item.

## Cobranças

- **Uma cobrança pendente por OS.** O índice único parcial `payments_pending_work_order_id_key` aceita uma só linha `PENDING` por `work_order_id` e ignora as encerradas, então a OS pode ter um sinal pago e depois a cobrança do saldo. A criação confere a cobrança pendente antes e responde 409; o índice garante a regra quando duas criações correm juntas. Ele é declarado no `schema.prisma` com o recurso em preview `partialIndexes` do Prisma, e a migration é gerada pelo Prisma, sem SQL escrito à mão.
- **Uma cobrança por order.** O único em `checkout_id` liga cada order do Mercado Pago a uma cobrança só, e é por ele que o webhook acha a cobrança (`findByCheckoutId`).
- **Id gerado antes da order.** O id do `Payment` vai para o Mercado Pago como `external_reference` e como chave de idempotência da criação; a linha só é gravada depois que a order existe, junto com `billing.payment.requested` no outbox.
- **Valor e saldo.** `amount` fica em `DECIMAL(10,2)`. O saldo não é coluna: ele é calculado a cada leitura a partir do `total_amount` do orçamento `APPROVED` da OS e das cobranças `APPROVED`.
- **Transição só a partir de `PENDING`, com `version`.** Toda atualização de `payments` filtra pela `version` lida; o webhook e o cancelamento da mesma cobrança, ao mesmo tempo, fazem o segundo falhar com 409.
- **Listagens.** A lista paginada ordena por `created_at` decrescente; a lista interna da OS, por `created_at` crescente. Nenhuma tem índice próprio além do parcial, porque uma OS tem poucas cobranças.

## Cache

Cache-aside no Valkey, só com dados do Billing: `billing:quote:<id>` (detalhe com itens) e `billing:work-order-quotes:<workOrderId>` (lista da OS), TTL de 12 h (`CACHE_TTL_SECONDS`), formato com `cacheVersion`. O resumo da OS e os dados de exibição dos itens nunca entram no cache: são lidos no Work Order e no Inventory a cada resposta. Toda escrita apaga as chaves afetadas **depois do commit**, inclusive as dos outros orçamentos que a aprovação rejeita e que a reversão restaura; a lista paginada `GET /api/quotes` não usa cache. As cobranças não entram no cache: o status muda pelo webhook, e uma exclusão de chave que falhasse mostraria `PENDING` numa cobrança já paga até o TTL.
