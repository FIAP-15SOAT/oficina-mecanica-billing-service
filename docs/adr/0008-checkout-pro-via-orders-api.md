# ADR 0008: Checkout Pro via Orders API, atrás de uma porta neutra

## Status

Aceito — 2026-11-09

## Contexto

A oficina cobra do cliente o sinal ou o saldo de uma ordem de serviço (OS) com o orçamento aprovado. O Billing é o único serviço com responsabilidade financeira, então é ele quem fala com o provedor de pagamento, o Mercado Pago, e guarda as credenciais.

A escolha tem quatro restrições:

- a solução não tem frontend próprio: o cliente recebe o link de pagamento por e-mail e paga numa página do provedor;
- o número do cartão não pode passar pelo backend, o que colocaria o sistema no escopo do PCI DSS, o padrão de segurança da indústria de cartões;
- o Billing precisa saber quando a cobrança expira e precisa cancelá-la quando a Saga de cobrança, orquestrada pelo Work Order, desiste dela;
- a criação de uma cobrança não pode gerar duas cobranças no provedor, e a chamada precisa aparecer no trace como as outras chamadas HTTP do serviço.

O Mercado Pago oferece o Checkout Transparente (o formulário de pagamento fica no frontend do vendedor), o Checkout Pro via Preferences e o Checkout Pro via Orders API. No Checkout Pro, a página de pagamento é do Mercado Pago e aceita Pix, cartão de crédito, cartão de débito e boleto. O SDK oficial para Node.js, `mercadopago`, traz clientes para a Orders API.

## Decisão

**O Billing cria, consulta e cancela as cobranças pelo Checkout Pro via Orders API, chamada pelo `HttpService` do `@nestjs/axios`, atrás da porta neutra `IPaymentProviderGateway`.**

1. **Uma order por cobrança.** `POST /v1/orders` com `type` `online`, `processing_mode` `manual`, `total_amount` em texto, `expiration_time` igual a `MERCADOPAGO_ORDER_EXPIRATION` (`P1D` por padrão) e o id do `Payment`, gerado antes da chamada, em `external_reference` e no cabeçalho `X-Idempotency-Key`. A resposta traz o id da order, gravado em `checkoutId`, e o `checkout_url`, o link que o cliente abre.
2. **`capture_mode` `automatic_async`, fixo no adaptador.** O valor `automatic` liga o modo binário do Mercado Pago, que recusa pagamentos pendentes como Pix e boleto gerados e ainda não pagos.
3. **Sem repetição.** Cada chamada tem prazo de 5 s, sem redirecionamento. Uma criação que falha responde 503 sem gravar nada, e o funcionário repete com outro id; a order perdida, se existir, expira sozinha. No cancelamento, 400, 409 e 422 são recusa e levam à consulta da order; qualquer outra falha é indisponibilidade.
4. **Consulta e cancelamento na mesma API.** `GET /v1/orders/:id` é a fonte da verdade do status, e `POST /v1/orders/:id/cancel` cancela a order, com uma `X-Idempotency-Key` nova por chamada, porque cancelar de novo uma order cancelada é inofensivo.
5. **Porta neutra.** A porta `IPaymentProviderGateway` (`createCheckout`, `findCheckoutById`, `cancelCheckout`) devolve o status neutro `CheckoutStatus`, e o `CheckoutStatusMapper` o leva ao status final da cobrança. Só o adaptador `HttpMercadoPagoOrderGateway` conhece a Orders API e traduz o status da order; um status que o Mercado Pago acrescente depois vira `IN_PROGRESS` e mantém a cobrança aberta.
6. **SDK só no webhook.** O pacote `mercadopago` 3.6.1 entra apenas para validar a assinatura do webhook ([ADR 0009](0009-webhook-com-hmac-e-consulta-da-order.md)).

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Checkout Transparente via Orders, só com Pix | Sem passo no painel e com a experiência dentro da solução, mas só Pix: cartão exige um token gerado no frontend, que a solução não tem | — |
| Token de cartão gerado no backend | Aceita cartão sem frontend, mas o número do cartão passaria pelo servidor, o que coloca o sistema no escopo do PCI DSS | — |
| Checkout Pro via Preferences | Aceita uma URL de notificação por cobrança, sem passo no painel, mas não notifica a expiração e não tem cancelamento, só antecipar a data de expiração; a OS precisaria de um job de expiração próprio | O passo no painel virar impeditivo: então Preferences com job de expiração próprio |
| Clientes `Order` do SDK `mercadopago` | Menos código, mas usam o `fetch` nativo, que a instrumentação HTTP não vê (sem span de cliente no trace); têm a URL `https://api.mercadopago.com` fixa num campo interno, o que impede o stub do e2e e do DAST; e vêm com prazo de 60 s e três repetições | O SDK expuser a URL base e usar um transporte instrumentado |
| SDK com a instrumentação `undici` e a URL base sobrescrita por import do interno do pacote | Mantém o SDK, mas são dois contornos sobre o interno dele, que quebram numa atualização | — |
| Repetir o 423 com backoff e o 429 com `Retry-After` | Absorve falhas curtas, mas a requisição do funcionário esperaria além do prazo, e o handler do comando já tem a reentrega da fila | O sandbox mostrar 429 frequente |
| Porta com o nome e o formato do Mercado Pago (`IMercadoPagoOrderGateway`), como os gateways para os serviços da solução | Segue o padrão dos outros gateways, mas prende os casos de uso ao Mercado Pago, e a troca de provedor mexeria na aplicação inteira | O adaptador começar a esconder diferenças que os casos de uso precisam ver |
| `PaymentStatus` direto na porta | Um tipo a menos, mas o checkout tem estados que a cobrança não tem: aberto e com pagamento iniciado são ambos `PENDING`, e estorno e chargeback não mudam a cobrança | — |
| `capture_mode` por variável de ambiente | Troca sem build, mas o valor é um só e só muda por decisão revisada | — |

## Consequências

### Positivas

- O cliente paga por Pix, cartão ou boleto sem frontend da solução, e o cartão nunca passa pelo Billing.
- Expiração e cancelamento vêm do provedor, sem job próprio no Billing.
- A chamada ao Mercado Pago aparece no trace como as outras chamadas HTTP, com o mesmo prazo curto e sem repetição escondida.
- A mesma `X-Idempotency-Key` e o mesmo `external_reference` ligam a order à cobrança, e a troca de provedor fica restrita a um adaptador.

### Negativas e limites

- A URL do webhook só é configurada no painel da aplicação, e muda quando o ambiente é recriado: é um passo manual a cada sessão de teste ([Runbook › URL do webhook no painel](../runbook.md#url-do-webhook-no-painel)).
- Uma criação cuja gravação falha depois da order criada deixa uma order sem cobrança, que expira sozinha no Mercado Pago.
- O cancelamento de uma order com pagamento iniciado e não concluído pode ser recusado; a cobrança então só fecha pelo webhook ([Arquitetura › Cancelamento](../architecture.md#cancelamento)).
- O adaptador repete à mão o que o SDK faria (montar a requisição e traduzir os erros), e a tradução do status da order precisa acompanhar novos status do Mercado Pago.

## Referências

- [Arquitetura › Cobranças com o Mercado Pago](../architecture.md#cobranças-com-o-mercado-pago)
- [API › Cobranças](../api.md#cobranças-apipayments)
- [Mercado Pago — Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview)
- [PCI DSS](https://www.pcisecuritystandards.org/standards/pci-dss/)
