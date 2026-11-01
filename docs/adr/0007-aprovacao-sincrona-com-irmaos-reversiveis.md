# ADR 0007: Aprovação síncrona com irmãos reversíveis

## Status

Aceito — 2026-11-01

## Contexto

O Billing é o dono dos orçamentos, e uma OS pode ter vários orçamentos ao mesmo tempo (os "irmãos" desta decisão). Aprovar um deles começa a Saga de aprovação, orquestrada pelo Work Order: o Inventory reserva as peças e, se faltar estoque, a Saga pede ao Billing que desfaça a aprovação. Enquanto a reserva não termina, a OS continua em `AWAITING_APPROVAL`.

A decisão precisa responder a quatro perguntas:

- o funcionário e o cliente esperam a resposta da aprovação, ou recebem um "aceito" e acompanham o resultado depois;
- o que acontece com os outros orçamentos abertos da OS, e como eles voltam se a aprovação for desfeita;
- como garantir no máximo um orçamento aprovado por OS, inclusive com duas aprovações simultâneas;
- como a abertura da OS cria o orçamento inicial uma vez só, se o Work Order repetir a chamada.

Além disso, um orçamento criado, enviado e rejeitado durante a reserva publicaria `billing.quote.rejected` com `remainingSentCount = 0`; o Work Order levaria a OS a `REJECTED`, e a confirmação da reserva não conseguiria mais levá-la a `APPROVED`. A Saga ficaria presa, com o estoque reservado.

## Decisão

**A aprovação é síncrona e, numa transação, aprova o orçamento, rejeita os outros orçamentos abertos da OS guardando quem os substituiu e grava `billing.quote.approved` no outbox. No máximo um orçamento `APPROVED` por OS é garantido por consulta no próprio banco e pela `version` das linhas gravadas.**

1. **Resposta 200.** `PATCH /api/quotes/:id` e `POST /internal/quotes/:id/decisions` respondem com o orçamento aprovado. Só o efeito em outros serviços (reserva e mudança da OS) segue por mensagem.
2. **Irmãos rejeitados na mesma transação, sem evento.** Os orçamentos `PENDING` e `SENT` da OS ficam `REJECTED` com `replaced_by_quote_id` = o aprovado. Eles não publicam `billing.quote.rejected`, que levaria a OS a `REJECTED` no meio da Saga.
3. **Restauração por duas colunas que já existem.** A reversão (`billing.quote.revert_approval`) devolve a `SENT` os irmãos com `sent_at` e a `PENDING` os sem, porque só o envio grava `sent_at` e nada volta a `PENDING`. Não há `previous_status`.
4. **Um aprovado por OS.** A aprovação lê os orçamentos da OS na transação e responde 409 se outro está `APPROVED`. A criação e o envio respondem 409 pela mesma consulta, para que nenhum orçamento novo nasça e seja rejeitado durante a reserva. Depois da reversão para `SENT`, a OS volta a aceitar criação e aprovação, e a nova aprovação reabre a Saga.
5. **Concorrência pela `version`, em ordem de id.** A aprovação grava o orçamento e cada irmão com `version`, ordenados por id. Duas aprovações de orçamentos diferentes da mesma OS escrevem as mesmas linhas: a segunda falha pela versão e responde 409, e a ordem por id evita o deadlock entre elas. A reversão grava na mesma ordem.
6. **Orçamento inicial idempotente sem índice.** `POST /internal/quotes` procura um orçamento com o mesmo `workOrderId` e devolve o existente (201) em vez de criar outro. Na abertura, só a própria abertura conhece aquele id.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Comando assíncrono, com resposta 202 | Desacopla a decisão do Billing, mas o usuário não sabe se a aprovação valeu; o efeito que precisa ser assíncrono é só o de outros serviços | — |
| Causa `SUPERSEDED` publicada por evento para os irmãos | Deixa explícito por que o irmão foi rejeitado, mas soma um evento que o Work Order teria de ignorar e muda o comportamento de hoje, em que os irmãos são rejeitados na mesma transação | — |
| Coluna `previous_status` | Guarda o status anterior explicitamente, mas repete o que `sent_at` já diz | Surgir um caminho que devolva orçamento enviado a `PENDING` |
| Índice único parcial em `quotes(work_order_id) WHERE status = 'APPROVED'` | O banco garante a regra sozinho, mas a consulta na transação e a `version` já cobrem o caso, e a violação viraria erro de banco a traduzir | Aparecer aprovação concorrente real que escape da `version` |
| Expor a Saga ativa em `GET /internal/work-orders/:id` | O Billing saberia da reserva em andamento, mas muda o contrato interno do Work Order e só protege com ele no ar | — |
| O Work Order ignorar `billing.quote.rejected` durante a Saga | Funciona, mas deixa orçamentos pendurados numa OS que vai a `APPROVED` | — |
| Advisory lock por OS em toda escrita de orçamento | Serializa tudo da OS, mas trava também inclusões de item e leituras longas para proteger o que a `version` dos irmãos já protege | A `version` deixar passar uma corrida comprovada |
| Compensação sempre para `REJECTED`, ou o Billing bloqueando a reaprovação | Simplifica a Saga, mas muda o comportamento de hoje: depois de repor o estoque, o mesmo orçamento é aprovado de novo | — |
| Índice único em `quotes(work_order_id)` para a abertura | Idempotência pelo banco, mas impede os orçamentos concorrentes da mesma OS | — |
| Índice único parcial com uma coluna `initial` | Correto, mas acrescenta coluna e índice para um caso que a consulta já resolve | O Work Order passar a repetir a abertura concorrentemente |
| Tirar os itens da abertura da OS | Elimina o orçamento inicial, mas muda o contrato público da abertura | — |

## Consequências

### Positivas

- O usuário recebe a aprovação na hora, e a Saga começa por um evento gravado na mesma transação.
- Desfazer a aprovação devolve a OS ao estado de antes, com os mesmos orçamentos abertos, sem coluna nova.
- No máximo um orçamento `APPROVED` por OS, sem lock explícito e sem índice.
- A abertura repetida não duplica o orçamento inicial.

### Negativas e limites

- Duas aprovações simultâneas da mesma OS fazem uma delas responder 409; o usuário repete depois de reler.
- Um orçamento criado entre a leitura e o commit de uma aprovação fica `PENDING`; o envio dele responde 409 pela consulta de orçamento `APPROVED`.
- Duas rejeições simultâneas dos dois últimos orçamentos `SENT` de uma OS contam uma à outra como `SENT` e publicam `remainingSentCount = 1`: a OS não vai a `REJECTED` sozinha. Fechar essa corrida exigiria travar a OS em toda rejeição.
- A exclusão do orçamento inicial não usa `version`: um envio em corrida com a compensação da abertura não é barrado, porque só a abertura conhece o id.
- O orçamento inicial fica órfão se o Work Order cair entre criar o orçamento e gravar a OS e a compensação também falhar. Ele aparece em `GET /api/quotes`, e a página que o contém responde 404, porque o Work Order não conhece a OS; a recuperação é apagá-lo por `DELETE /internal/quotes/:id`.
- A reversão é idempotente só por estado, e o comando não identifica a aprovação que reverte. Se a confirmação da mensagem falhar depois do commit e o orçamento, devolvido a `SENT`, for aprovado de novo antes da reentrega, a reentrega reverte essa segunda aprovação.

## Referências

- [Arquitetura › Aprovação síncrona](../architecture.md#aprovação-síncrona)
- [Mensageria › Reversão da aprovação](../messaging.md#reversão-da-aprovação)
- [Banco de dados › Colunas de decisão e de restauração](../database.md#colunas-de-decisão-e-de-restauração)
- [Saga](https://microservices.io/patterns/data/saga.html)
- [PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html)
