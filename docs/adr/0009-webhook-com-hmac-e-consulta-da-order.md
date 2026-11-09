# ADR 0009: Webhook com HMAC e consulta da order, sem reconciliador

## Status

Aceito — 2026-11-09

## Contexto

O Mercado Pago avisa cada mudança de uma order do Checkout Pro por um webhook: um `POST` na URL cadastrada no painel da aplicação, com o id da order em `data.id` na query e o cabeçalho `x-signature`, que traz o instante (`ts`) e um HMAC-SHA256 calculado com a chave secreta do webhook. No cluster, a rota `POST /webhooks/mercadopago` chega ao Billing pelo API Gateway, que preserva a query e o `x-request-id`, porque a assinatura é calculada sobre eles. O Mercado Pago repete a notificação até receber uma resposta 2xx.

A decisão precisa responder a quatro perguntas:

- como recusar uma notificação forjada, numa rota que não tem token de usuário;
- de onde vem o status da cobrança: do corpo da notificação ou do Mercado Pago;
- como tratar a notificação repetida, que o Mercado Pago manda por desenho;
- o que acontece com a cobrança se a notificação nunca chegar (URL errada no painel ou expiração sem aviso).

## Decisão

**O webhook valida a assinatura com o validador do SDK, consulta a order, encerra só a cobrança `PENDING` e responde 200 depois de processar. Não há reconciliador nem tabela de deduplicação: sem notificação, o funcionário cancela a cobrança.**

1. **Assinatura pelo SDK.** O `MercadoPagoSignatureGuard` chama o `WebhookSignatureValidator.validate` do SDK `mercadopago` 3.6.1 sobre o manifest `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;` e a chave `MERCADOPAGO_WEBHOOK_SECRET`, com comparação em tempo constante. Assinatura que não confere, `ts` ausente ou `data.id` ausente respondem 401 e registram `payment.webhook.invalid_signature`; a rota é `@Public()` e fica fora do prefixo `api` e do Swagger.
2. **A order é a fonte da verdade.** O corpo da notificação não é lido. O `SyncPaymentStatusUseCase` acha a cobrança pelo `checkoutId` e consulta `GET /v1/orders/:id`.
3. **Transição só a partir de `PENDING`, com a `version`.** A cobrança `PENDING` com a order encerrada vai ao status final e publica o evento pelo outbox, na mesma transação. Notificação repetida, de cobrança encerrada ou de order desconhecida não muda nada e registra `payment.sync_skipped`. Estorno e chargeback só registram `payment.checkout_reversed`, inclusive na cobrança `APPROVED`, que por isso continua sendo consultada.
4. **200 depois de processar.** O processamento é uma consulta e uma transação, bem abaixo do tempo que o Mercado Pago espera. Mercado Pago fora do ar na consulta responde 503, e um conflito de versão com o cancelamento responde 409: nos dois casos o Mercado Pago repete a notificação.
5. **Sem notificação, cancelamento.** Uma cobrança presa em `PENDING` é encerrada pelo funcionário em `POST /api/payments/:id/cancellations`: o cancelamento recusado consulta a order e aplica o status real, inclusive `expired` ([Runbook › Cobrança presa](../runbook.md#cobrança-presa)).

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| HMAC-SHA256 escrito à mão no adaptador | Sem dependência do SDK, mas repete o manifest, a comparação em tempo constante e a tolerância do `ts` que o SDK já faz | — |
| Autorizador no API Gateway para a rota do webhook | Recusa a notificação forjada antes do Billing, mas exige copiar a chave do webhook para a borda, fora do único serviço que guarda as credenciais do Mercado Pago | — |
| Confiar no status do corpo da notificação | Uma chamada a menos, mas o status passaria a depender de um corpo que a assinatura não cobre | — |
| Responder 200 na hora e processar por uma fila interna | Resposta mais rápida, mas soma uma fila e um consumidor para um processamento que já é curto | O processamento ficar lento |
| Deduplicação por `SET NX` no cache ou tabela `payment_notifications` | Descarta a repetição antes da consulta, mas o processamento já é idempotente: a consulta da order e a transição só a partir de `PENDING` dão o mesmo resultado | — |
| Reconciliador periódico, que consulta as cobranças pendentes a cada 60 s | Fecha a cobrança mesmo sem notificação, mas soma um job e consultas constantes ao Mercado Pago para um caso que o cancelamento pelo funcionário resolve | O painel não puder apontar para a URL do ambiente |

## Consequências

### Positivas

- Uma notificação forjada responde 401 e não muda nada; um corpo adulterado não tem efeito, porque o status vem da consulta.
- A repetição do Mercado Pago é inofensiva, sem tabela nem chave de cache.
- O desfecho da cobrança sai pelo outbox na mesma transação do status, como os outros eventos do Billing.
- O log e a métrica `oficina.payment.webhook.received` (`outcome` `valid` ou `invalid_signature`) mostram se a URL e a chave do painel estão certas.

### Negativas e limites

- Sem notificação, a cobrança fica `PENDING` até o funcionário cancelar: não há fechamento automático.
- Cada notificação de uma cobrança `APPROVED` ainda consulta o Mercado Pago, para registrar estorno ou chargeback.
- Uma chave do webhook trocada no painel e não atualizada no Billing faz toda notificação responder 401 até a atualização ([Runbook › Troca da chave secreta do webhook](../runbook.md#troca-da-chave-secreta-do-webhook)).
- O webhook não alcança o stack local: só a URL HTTPS cadastrada no painel recebe as notificações.

## Referências

- [Arquitetura › Webhook do Mercado Pago](../architecture.md#webhook-do-mercado-pago)
- [API › Webhook do Mercado Pago](../api.md#webhook-do-mercado-pago)
- [ADR 0008 — Checkout Pro via Orders API](0008-checkout-pro-via-orders-api.md)
- [Mercado Pago — Notificações do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications)
