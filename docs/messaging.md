# Mensageria

O Billing participa da Saga de aprovação do orçamento, orquestrada pelo Work Order, por mensagens no tópico SNS FIFO `oficina-events.fifo`. Ele publica os eventos dos orçamentos pelo outbox e consome da fila `billing.fifo` o comando de reversão da aprovação. A topologia (tópico, filas, DLQs e filter policies) vem do repositório de infraestrutura de mensageria; a mecânica do relay e do consumidor está em [Arquitetura](architecture.md#mensageria). Os tipos e os payloads vêm do catálogo tipado e fechado de `app/src/domain/messaging/`.

## Índice

- [Envelope e chaves](#envelope-e-chaves)
- [Eventos publicados](#eventos-publicados)
- [Comando consumido](#comando-consumido)
- [Reversão da aprovação](#reversão-da-aprovação)
- [Outbox e cache](#outbox-e-cache)

## Envelope e chaves

Toda mensagem tem `messageId` (UUID), `type`, `occurredAt`, `workOrderId` e `payload`; o contexto W3C (`traceparent`) vai nos atributos da mensagem. Os eventos de orçamento sempre levam o `workOrderId` da OS no envelope, por isso o payload não o repete.

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

- **`billing.quote.sent`**: `sentBy` é o funcionário do token. Os nomes dos itens são lidos no Inventory no envio e servem só para o e-mail ao cliente, que o Work Order manda ao receber o evento; o Billing não manda e-mail.
- **`billing.quote.approved`**: leva ids, quantidades e preços congelados, para o Work Order pedir a reserva das peças ao Inventory sem consultar o Billing. Os outros orçamentos `PENDING` e `SENT` da OS, rejeitados pela aprovação na mesma transação, **não** publicam `billing.quote.rejected`: se publicassem, o Work Order levaria a OS a `REJECTED` no meio da reserva.
- **`billing.quote.rejected`**: `remainingSentCount` conta os outros orçamentos `SENT` da OS na mesma transação da rejeição; o Work Order decide a OS por ele (com `0`, nenhum orçamento resta para o cliente decidir).
- **`billing.quote.approval_reverted`**: resposta ao comando de reversão, publicada uma vez por reversão efetiva.

## Comando consumido

| Tipo | Payload | Quem envia |
| --- | --- | --- |
| `billing.quote.revert_approval` | `{ quoteId: uuid, revertTo: "SENT" \| "REJECTED" }` | Work Order, quando a Saga de aprovação precisa desfazer a aprovação |

O payload é validado antes do handler (`RevertQuoteApprovalPayloadDto`). Payload inválido ou falha no handler não confirma a mensagem: a fila a reentrega e, na quinta vez, o SQS a move para a `billing-dlq.fifo`.

`revertTo = SENT` é a resposta à falta de estoque: o orçamento volta a poder ser aprovado depois da reposição. `revertTo = REJECTED` encerra o orçamento.

**Idempotência por estado.** O comando não tem chave própria: o handler só age sobre orçamento `APPROVED`. Uma reentrega, ou um comando repetido depois que o orçamento já saiu de `APPROVED`, encontra outro status, registra `quote.approval_revert_skipped` com o status atual e confirma a mensagem sem mudar nada nem publicar de novo; a primeira execução já gravou a resposta no outbox. Orçamento inexistente segue o mesmo caminho, sem status no log.

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

## Outbox e cache

Cada evento é gravado na tabela `outbox` na mesma transação que muda o orçamento; o relay o publica e apaga a linha. Uma transação desfeita não deixa evento. A escrita do orçamento com `version` vem antes do `outbox.add`, então duas transações sobre o mesmo orçamento não invertem a ordem dos eventos da OS.

Envio, aprovação, rejeição e reversão apagam, **depois do commit**, as chaves `billing:quote:<id>` dos orçamentos alterados e `billing:work-order-quotes:<workOrderId>`; se a exclusão falha, a chave expira pelo TTL.
