# ADR 0005: Mensageria SNS/SQS FIFO com outbox transacional

## Status

Aceito — 2026-10-27

## Contexto

O Billing participa de fluxos que cruzam serviços: o orçamento aprovado ou rejeitado avisa o Work Order, a cobrança criada e o pagamento confirmado também, e o Work Order pede ao Billing que reverta uma aprovação ou cancele uma cobrança quando a Saga compensa. Cada serviço é dono do próprio PostgreSQL, então essas mudanças não cabem numa transação só.

O broker é o da AWS: Amazon SNS e SQS. O SNS não participa da transação do PostgreSQL. Gravar o estado e publicar em seguida é uma dupla escrita: se o processo cair entre as duas, ou o aviso se perde, ou sai aviso de uma mudança desfeita. As mensagens de uma mesma ordem de serviço precisam chegar em ordem.

## Decisão

**Outbox transacional no PostgreSQL do Billing, relay no próprio processo, um tópico SNS FIFO da solução e a fila SQS FIFO `billing.fifo`.** É o mesmo kit dos outros serviços.

1. **A mensagem é uma linha da tabela `outbox`**, gravada pelo `IOutboxRepository` dentro da mesma transação do `IUnitOfWork` que muda o estado. Tipo e payload vêm de um catálogo tipado e fechado em `domain/messaging/`: tipo desconhecido não compila. O contexto W3C do trace é gravado na linha.
2. **O relay roda no processo** (`OutboxRelayService`), a cada 500 ms: abre uma transação, toma `pg_try_advisory_xact_lock` (uma réplica publica por vez), lê até 10 linhas pelo `id`, publica uma a uma e apaga as publicadas na mesma transação. Na primeira falha, o lote para.
3. **Um tópico FIFO** (`oficina-events.fifo`) e **uma fila FIFO por serviço**, com filter policy por `type`. A `billing.fifo` recebe só `billing.quote.revert_approval` e `billing.payment.cancel`. `MessageGroupId` = `workOrderId`; `MessageDeduplicationId` = `messageId`.
4. **Envelope com cinco campos**: `messageId`, `type`, `occurredAt`, `workOrderId` e `payload`.
5. **O consumidor confirma só no sucesso.** O `SqsConsumerService` processa uma mensagem por vez. Erro, envelope inválido ou tipo sem handler deixam a mensagem na fila; na quinta entrega, o SQS a move para a `billing-dlq.fifo`. Os handlers são idempotentes pelo `messageId` ou pelo estado.

O serviço sobe com o consumidor ligado e sem handler. Como a filter policy só roteia os tipos do Billing, uma mensagem sem handler é janela de deploy: ela é registrada (`messaging.message.unhandled`), não é confirmada e vai para a DLQ, onde fica para redrive.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Publicar no SNS na transação, ou logo depois do commit com retry em memória | Menos código, mas é a dupla escrita | — |
| Outbox no DynamoDB | Tira a tabela do PostgreSQL, mas sem transação em comum com o dado de negócio | O dado de negócio ir para o DynamoDB |
| Marcar `published_at` e limpar depois | Guarda histórico, mas exige coluna, job de limpeza e cuidado com payload sensível no banco | — |
| Vários relays com `FOR UPDATE SKIP LOCKED` | Publica em paralelo, mas réplicas diferentes furariam a ordem da FIFO | O volume exigir publicação em paralelo |
| Relay como processo ou Job separado | Isola a carga, mas soma deployment, credencial e ponto de falha | A carga do relay competir com as requisições |
| Tabela `inbox` com os ids processados | Deduplicação genérica, mas os handlers já são idempotentes e a FIFO deduplica por 5 min | Um handler não conseguir ser idempotente |
| Tópico por serviço e filas de comando separadas | Isola os produtores, mas dobra filas e caminhos de publicação | — |
| Comandos direto na fila do consumidor | Um salto a menos, mas dois caminhos de publicação | Uma filter policy errada causar perda |
| Filas standard com versão do agregado | Mais vazão, mas a ordem passaria a exigir checagem de versão em todo handler | A vazão da FIFO limitar |
| Envelope com `kind`, `source`, `correlationId`, `causationId` e `sagaId` | Mais metadado explícito, redundante com o tipo, o `workOrderId` e o trace | — |
| Confirmar a mensagem sem handler | Sem retentativas inúteis, mas um tipo publicado antes do handler existir se perderia em silêncio | — |

## Consequências

### Positivas

- Nenhuma mudança de estado fica sem aviso, e nenhum aviso sai de estado desfeito.
- Ordem por OS sem código de versão nos handlers.
- O trace segue da requisição que gravou a mensagem até o handler do outro serviço.

### Negativas e limites

- Até ~500 ms entre o commit e a publicação, mais o long polling do consumidor.
- Uma falha persistente na publicação segura todas as mensagens do serviço (`messaging.outbox.publish_failed` precisa de monitor).
- O SQS entrega pelo menos uma vez: todo handler precisa ser idempotente.
- O relay consulta o banco a cada 500 ms por réplica, mesmo sem mensagens.

## Referências

- [Arquitetura › Mensageria](../architecture.md#mensageria)
- [Testes › Mensageria no E2E](../testing.md#mensageria-no-e2e)
- [AWS — Amazon SNS FIFO topics](https://docs.aws.amazon.com/sns/latest/dg/sns-fifo-topics.html)
- [AWS — Amazon SQS FIFO queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
