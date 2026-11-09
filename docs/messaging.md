# Mensageria

O Billing participa de duas Sagas orquestradas pelo Work Order, por mensagens no tópico SNS FIFO `oficina-events.fifo`: a Saga de aprovação do orçamento e a Saga de cobrança. Ele publica os eventos dos orçamentos e das cobranças pelo outbox e consome da fila `billing.fifo` os comandos de reversão da aprovação e de cancelamento da cobrança. A topologia (tópico, filas, DLQs e filter policies) vem do repositório de infraestrutura de mensageria; a mecânica do relay e do consumidor está em [Arquitetura](architecture.md#mensageria). Os tipos e os payloads vêm do catálogo tipado e fechado de `app/src/domain/messaging/`.

## Índice

- [Envelope e chaves](#envelope-e-chaves)
- [Eventos publicados](#eventos-publicados)
- [Comandos consumidos](#comandos-consumidos)
- [Reversão da aprovação](#reversão-da-aprovação)
- [Cancelamento da cobrança](#cancelamento-da-cobrança)
- [Outbox e cache](#outbox-e-cache)

## Envelope e chaves

Toda mensagem tem `messageId` (UUID), `type`, `occurredAt`, `workOrderId` e `payload`; o contexto W3C (`traceparent`) vai nos atributos da mensagem. Os eventos de orçamento e de cobrança sempre levam o `workOrderId` da OS no envelope, por isso o payload não o repete.

| Atributo SNS | Valor | Efeito |
| --- | --- | --- |
| `MessageGroupId` | `workOrderId` | As mensagens de uma OS chegam na ordem em que foram gravadas |
| `MessageDeduplicationId` | `messageId` | O SNS descarta a mesma mensagem publicada de novo pelo relay dentro da janela de deduplicação |

A chave de idempotência de um evento do Billing, para quem o consome, é o `messageId`. Valores monetários vão como texto com duas casas (`"219.90"`), para não perder precisão.

## Eventos publicados

| Tipo | Payload | Quando |
| --- | --- | --- |
| `billing.quote.sent` | `{ quoteId, sentBy, total, items: [{ name, quantity, unitPrice }] }` | Envio do orçamento ao cliente |
| `billing.quote.approved` | `{ quoteId, decidedBy, total, services: [{ serviceId, quantity, unitPrice }], partsSupplies: [{ partSupplyId, quantity, unitPrice }] }` | Aprovação pelo funcionário ou pelo cliente |
| `billing.quote.rejected` | `{ quoteId, reason, remainingSentCount, decidedBy }` | Rejeição com motivo, pelo funcionário ou pelo cliente |
| `billing.quote.approval_reverted` | `{ quoteId, revertTo }` (`SENT` ou `REJECTED`) | Reversão da aprovação concluída |
| `billing.payment.requested` | `{ paymentId, amount, checkoutUrl, expiresAt }` | Cobrança criada no Mercado Pago e gravada `PENDING` |
| `billing.payment.approved` | `{ paymentId, amount, paidAt }` | Cobrança paga, pelo webhook ou pelo cancelamento recusado com a order paga |
| `billing.payment.failed` | `{ paymentId, reason }` (`EXPIRED`, `REJECTED` ou `CANCELLED`) | Cobrança encerrada sem pagamento: expirada, recusada pelo Mercado Pago ou cancelada |

- **`billing.quote.sent`**: `sentBy` é o funcionário do token. Os nomes dos itens são lidos no Inventory no envio e servem só para o e-mail ao cliente, que o Work Order manda ao receber o evento; o Billing não manda e-mail.
- **`billing.quote.approved`**: leva ids, quantidades e preços congelados, para o Work Order pedir a reserva das peças ao Inventory sem consultar o Billing. Os outros orçamentos `PENDING` e `SENT` da OS, rejeitados pela aprovação na mesma transação, **não** publicam `billing.quote.rejected`: se publicassem, o Work Order levaria a OS a `REJECTED` no meio da reserva.
- **`billing.quote.rejected`**: `remainingSentCount` conta os outros orçamentos `SENT` da OS na mesma transação da rejeição; o Work Order decide a OS por ele (com `0`, nenhum orçamento resta para o cliente decidir).
- **`billing.quote.approval_reverted`**: resposta ao comando de reversão, publicada uma vez por reversão efetiva.
- **`billing.payment.requested`**: `checkoutUrl` é o link de pagamento do Checkout Pro do Mercado Pago, e `expiresAt`, o instante em que a order expira. O Billing não manda o link ao cliente.
- **`billing.payment.approved`** e **`billing.payment.failed`**: o desfecho de cada cobrança, publicado uma vez só, porque só a cobrança `PENDING` é encerrada. `paidAt` é o instante em que o Billing gravou a aprovação. O motivo `CANCELLED` também responde ao comando `billing.payment.cancel`.

## Comandos consumidos

| Tipo | Payload | Quem envia |
| --- | --- | --- |
| `billing.quote.revert_approval` | `{ quoteId: uuid, revertTo: "SENT" \| "REJECTED" }` | Work Order, quando a Saga de aprovação precisa desfazer a aprovação |
| `billing.payment.cancel` | `{ paymentId: uuid, reason: string }` | Work Order, quando a Saga de cobrança precisa cancelar a cobrança pendente |

Os payloads são validados antes do handler (`RevertQuoteApprovalPayloadDto` e `CancelPaymentPayloadDto`). Payload inválido ou falha no handler não confirma a mensagem: a fila a reentrega e, na quinta vez, o SQS a move para a `billing-dlq.fifo`.

### Destino e idempotência da reversão

`revertTo = SENT` é a resposta à falta de estoque: o orçamento volta a poder ser aprovado depois da reposição. `revertTo = REJECTED` encerra o orçamento.

**Idempotência por estado.** O comando não tem chave própria: o handler só age sobre orçamento `APPROVED`. Uma reentrega, ou um comando repetido depois que o orçamento já saiu de `APPROVED`, encontra outro status, registra `quote.approval_revert_skipped` com o status atual e confirma a mensagem sem mudar nada nem publicar de novo; a primeira execução já gravou a resposta no outbox. Orçamento inexistente segue o mesmo caminho, sem status no log. O limite: o comando não identifica a aprovação que reverte. Se a confirmação falhar depois do commit e o orçamento, devolvido a `SENT`, for aprovado de novo antes da reentrega, a reentrega encontra `APPROVED` e reverte essa nova aprovação ([ADR 0007](adr/0007-aprovacao-sincrona-com-irmaos-reversiveis.md)).

## Reversão da aprovação

![Diagrama de sequência UML da reversão da aprovação por comando: o Work Order publica billing.quote.revert_approval; o SqsConsumerService valida envelope e payload, chama o QuoteMessageHandlers e o RevertQuoteApprovalUseCase; fragmentos alt mostram o comando repetido (confirma sem efeito), a versão que mudou no laço de update, a falha absorvida do cache e, no fim, a mensagem não confirmada, reentregue até a quinta entrega e então movida para a billing-dlq.fifo; o relay publica billing.quote.approval_reverted](diagrams/quote-revert-sequence.drawio.png)

Numa transação, o `RevertQuoteApprovalUseCase`:

1. lê o orçamento; fora de `APPROVED`, encerra sem efeito (acima);
2. leva o orçamento a `revertTo`, apagando `approved_at` e `decided_by` (com `REJECTED`, grava `rejected_at`);
3. restaura os orçamentos que a aprovação dele rejeitou, os que têm `replaced_by_quote_id` igual ao id dele: cada um volta a `SENT` se tem `sent_at`, senão a `PENDING`, e perde `replaced_by_quote_id` e `rejected_at`. Um orçamento rejeitado pelo cliente não tem `replaced_by_quote_id` e fica como está;
4. grava todos com `version`, em ordem de id;
5. grava `billing.quote.approval_reverted` no outbox.

Depois do commit, apaga do cache as chaves do orçamento, dos restaurados e da lista da OS, e registra `quote.approval_reverted`. Um orçamento de volta a `SENT` pode ser aprovado de novo, e a nova aprovação publica outro `billing.quote.approved`.

A aprovação, que inicia a Saga, está em [Arquitetura › Aprovação síncrona](architecture.md#aprovação-síncrona).

## Cancelamento da cobrança

O handler de `billing.payment.cancel` (`PaymentMessageHandlers`) chama o mesmo `CancelPaymentUseCase` da rota `POST /api/payments/:id/cancellations` ([API › Cancelamento](api.md#cancelamento-post-apipaymentsidcancellations)). O `reason` do comando é validado e não muda o resultado: o motivo publicado é o status final da cobrança.

| Situação | Efeito | Mensagem |
| --- | --- | --- |
| Cobrança `PENDING` e order cancelada no Mercado Pago | `CANCELLED` e `billing.payment.failed` (`CANCELLED`) | Confirmada |
| Cancelamento recusado e order encerrada sem pagamento | `EXPIRED`, `CANCELLED` ou `REJECTED` e `billing.payment.failed` com o motivo | Confirmada |
| Cancelamento recusado e order paga | `APPROVED` e `billing.payment.approved` | Confirmada |
| Cancelamento recusado com pagamento iniciado e não concluído | Nada muda; `payment.cancellation_skipped` no log. O webhook encerra a cobrança depois: paga, com `billing.payment.approved`; expirada, com `billing.payment.failed` | Confirmada |
| Cobrança fora de `PENDING` (comando repetido ou cobrança já encerrada) | Nada muda; `payment.cancellation_skipped` com o status atual | Confirmada |
| Cobrança inexistente, Mercado Pago fora do ar ou conflito de versão com um webhook ao mesmo tempo | Nada muda | **Não** confirmada: a fila a reentrega e, na quinta entrega, ela vai para a `billing-dlq.fifo` |

**Idempotência por estado.** Como a reversão, o comando não tem chave própria: o handler só cancela cobrança `PENDING`, e uma reentrega depois do cancelamento encontra `CANCELLED` e confirma sem publicar de novo. Os conflitos (cobrança encerrada, paga ou em pagamento) são respostas finais, que uma reentrega não mudaria; por isso o handler os confirma, e só as outras falhas voltam pela fila.

## Outbox e cache

Cada evento é gravado na tabela `outbox` na mesma transação que muda o orçamento ou a cobrança; o relay o publica e apaga a linha. Uma transação desfeita não deixa evento. A escrita do orçamento ou da cobrança com `version` vem antes do `outbox.add`, então duas transações sobre o mesmo agregado não invertem a ordem dos eventos da OS.

Envio, aprovação, rejeição e reversão apagam, **depois do commit**, as chaves `billing:quote:<id>` dos orçamentos alterados e `billing:work-order-quotes:<workOrderId>`; se a exclusão falha, a chave expira pelo TTL. As cobranças não usam cache.
