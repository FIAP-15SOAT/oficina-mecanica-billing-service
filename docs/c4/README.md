# 🧩 Modelo C4 — Billing Service

Este diretório documenta a API do Billing com o [modelo C4](https://c4model.com), no nível de Componente: as peças internas do container **API do Billing** e como elas se ligam ao banco, ao cache, à mensageria, aos outros serviços da oficina (Work Order e Inventory) e ao Mercado Pago, o provedor de pagamento das cobranças.

## Índice

- [Convenções](#convenções)
- [Nível 3 — Componente da API do Billing](#nível-3--componente-da-api-do-billing)
- [Documentação relacionada](#documentação-relacionada)

## Convenções

- **Tipo explícito em todo elemento.** Cada elemento declara o tipo entre colchetes (`[Pessoa]`, `[Sistema Externo]`, `[Container Externo: tecnologia]`, `[Componente: tecnologia]`).
- **Ícone de componente.** Cada componente leva o ícone UML clássico (dois retângulos), na paleta azul dos demais elementos.
- **Tecnologia só ao cruzar fronteira.** As setas entre componentes do mesmo container não levam tecnologia; ela aparece nas relações com o funcionário, o Kubernetes, o banco, o cache, a mensageria, os outros serviços (Work Order e Inventory) e o Mercado Pago.
- **Imagem com o fonte.** A imagem é gerada pelo PlantUML, ferramenta que desenha diagramas a partir de texto, com a biblioteca [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) v2.14.0, e o fonte do diagrama fica embutido no próprio PNG.

## Nível 3 — Componente da API do Billing

<p align="center"><img src="images/c4-component.png" alt="Diagrama de Componente C4 da API do Billing: o Funcionário apresenta o token de funcionário ao componente Guards/Segurança, que encaminha as rotas /api/quotes e /api/work-orders/:id/quotes aos Orçamentos e /api/payments às Cobranças; o Work Order e o Inventory chamam as Rotas Internas, que usam os casos de uso de orçamento e de cobrança; o Mercado Pago notifica o Webhook, que sincroniza o status da cobrança; Orçamentos e Cobranças leem a OS e os itens pelos Gateways, que chamam as rotas /internal do Work Order e do Inventory e a Orders API do Mercado Pago; os dois gravam pelos Repositories no PostgreSQL, e os Orçamentos usam o Cache sobre o ElastiCache Valkey; a Mensageria publica o outbox no SNS, consome a fila billing.fifo e entrega o comando de reversão aos Orçamentos e o de cancelamento às Cobranças; o Kubernetes consulta o Health, que verifica o banco" width="100%"></p>

O componente **Orçamentos** reúne os Clean Controllers, os casos de uso e o presenter dos orçamentos, e o componente **Cobranças**, os das cobranças. Destaques do fluxo: o **Funcionário** apresenta o token emitido pelo Identity ao **Guards / Segurança**, que o valida pela chave pública, sem consultar outro serviço; o **Work Order** e o **Inventory** chamam as **Rotas Internas** sem token, pela rede do cluster; os **Orçamentos** leem o status e o resumo da OS e os itens do catálogo pelos **Gateways**, gravam o orçamento e o evento na mesma transação pelos **Repositories** e invalidam o **Cache** depois do commit; a **Mensageria** publica as linhas do outbox (a tabela onde a mensagem é gravada na mesma transação do dado) e entrega aos **Orçamentos** o comando `billing.quote.revert_approval` lido da fila `billing.fifo`. As **Cobranças** criam, consultam e cancelam a order do **Mercado Pago** pelos **Gateways**, gravam a cobrança e o evento na mesma transação e recebem da **Mensageria** o comando `billing.payment.cancel`; o **Mercado Pago** avisa a mudança da order pelo **Webhook**, sem token, autenticado pela assinatura `x-signature`.

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| **Guards / Segurança** | NestJS Guards | `AuthenticationGuard` global que nega por padrão (token de funcionário, salvo `@Public()`), `JwtStrategy` RS256 pela chave pública e `RolesGuard` (RBAC, o controle de acesso por papel) |
| **Rotas Internas** | NestJS Controller | `/internal/quotes...`, `/internal/work-orders/:workOrderId/{quotes,payments,balance}` e `/internal/{services,parts-supplies}/:id/quote-usage`, `@Public()`, fora do prefixo `api` e do Swagger |
| **Webhook** | NestJS Controller · Guard | `POST /webhooks/mercadopago`, `@Public()`, fora do prefixo `api` e do Swagger; o `MercadoPagoSignatureGuard` valida a `x-signature` com o SDK `mercadopago` antes do `SyncPaymentStatusUseCase` |
| **Health** | NestJS Module | `GET /api/health/live` sem I/O e `GET /api/health/ready` com `SELECT 1`, consumidas pelas probes (verificações periódicas) do Kubernetes |
| **Orçamentos** | Clean Controllers · Use Cases | Criação condicionada à OS, itens com preço congelado, envio, aprovação síncrona com os outros orçamentos rejeitados de forma reversível, rejeição, reversão por comando e leitura com os dados de exibição do Inventory |
| **Cobranças** | Clean Controllers · Use Cases | Criação com a OS e o saldo conferidos, consulta, cancelamento pela rota e pelo comando, sincronização pelo webhook e saldo da OS, sobre a porta neutra `IPaymentProviderGateway` |
| **Gateways** | @nestjs/axios | `HttpWorkOrderGateway` e `HttpInventoryCatalogGateway` sobre o `InternalHttpClient`, com prazo de 2 s, `x-request-id` e `traceparent`; `HttpMercadoPagoOrderGateway` sobre o `HttpService`, com prazo de 5 s, sem repetição, o único que conhece o formato do Mercado Pago |
| **Mensageria** | NestJS Module · AWS SDK | Relay do outbox (rotina que lê o outbox e publica) para o SNS FIFO (o tópico Amazon SNS que entrega as mensagens em ordem e sem duplicata, por grupo) e consumidor da fila SQS `billing.fifo`, com o span `CONSUMER` (o trecho do rastreamento distribuído que registra o consumo de cada mensagem) e os handlers de `billing.quote.revert_approval` e `billing.payment.cancel` |
| **Cache** | NestJS Module · ioredis | Porta `ICache` sobre o Valkey, no padrão cache-aside (lê do cache e, na falta, do banco) para o detalhe e a lista de orçamentos da OS, que falha aberto: com o cache fora do ar, a leitura vai ao banco |
| **Repositories** | Prisma | Repositórios de orçamentos e de cobranças com `version` (controle de concorrência otimista), Unit of Work (a transação que agrupa as escritas de um caso de uso) e outbox gravado na mesma transação da mudança de estado |

| Elemento externo | Tipo | Papel |
|---|---|---|
| **Funcionário** | Pessoa | Administrador, mecânico ou atendente, com o token emitido pelo Identity |
| **Work Order** | Sistema externo | Dono das ordens de serviço: responde o status e o resumo da OS, chama as rotas internas de orçamento, de cobrança e de saldo e conduz as Sagas (sequências de passos entre serviços, orquestradas por ele) de aprovação e de cobrança |
| **Inventory** | Sistema externo | Dono do catálogo: responde preço e dados dos itens e consulta o uso de item antes de excluí-lo |
| **Kubernetes** | Sistema externo | Executa as probes de inicialização, vivacidade e prontidão do pod |
| **Mercado Pago** | Sistema externo | Provedor de pagamento: o Checkout Pro via Orders API cria, consulta e cancela as orders das cobranças e notifica o webhook |
| **Banco de Dados** | Container externo | Amazon RDS PostgreSQL 18 do Billing, com `quotes`, `quote_services`, `quote_part_supplies`, `payments` e `outbox` |
| **Cache Distribuído** | Container externo | Amazon ElastiCache Valkey 9.1 do Billing |
| **Mensageria AWS** | Container externo | Tópico `oficina-events.fifo`, fila `billing.fifo` e a DLQ `billing-dlq.fifo` (a fila que guarda as mensagens que falharam 5 vezes) |

## Documentação relacionada

- [Arquitetura](../architecture.md)
- [ADR 0005 — Mensageria SNS/SQS FIFO com outbox](../adr/0005-mensageria-sns-sqs-fifo-com-outbox.md)
- [ADR 0006 — Cache do dono no ElastiCache](../adr/0006-cache-do-dono-no-elasticache.md)
- [ADR 0007 — Aprovação síncrona com irmãos reversíveis](../adr/0007-aprovacao-sincrona-com-irmaos-reversiveis.md)
- [ADR 0008 — Checkout Pro via Orders API, atrás de uma porta neutra](../adr/0008-checkout-pro-via-orders-api.md)
- [ADR 0009 — Webhook com HMAC e consulta da order, sem reconciliador](../adr/0009-webhook-com-hmac-e-consulta-da-order.md)
