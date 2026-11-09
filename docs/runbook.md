# 🛠️ Runbook — Mercado Pago

Procedimentos da integração do Billing com o Mercado Pago: as contas de teste, as credenciais, a URL do webhook no painel, a troca da chave secreta, o pagamento com os cartões de teste e o encerramento de uma cobrança presa. O fluxo das cobranças está em [Arquitetura › Cobranças com o Mercado Pago](architecture.md#cobranças-com-o-mercado-pago).

O Billing usa o Checkout Pro via Orders API: cada cobrança (`Payment`) cria uma order no Mercado Pago, e o cliente paga na página do Checkout Pro, hospedada pelo Mercado Pago, pelo link `checkoutUrl`. O webhook é a notificação que o Mercado Pago envia ao Billing (`POST /webhooks/mercadopago`) a cada mudança da order.

## Índice

- [Contas de teste](#contas-de-teste)
- [Credenciais no GitHub](#credenciais-no-github)
- [URL do webhook no painel](#url-do-webhook-no-painel)
- [Troca da chave secreta do webhook](#troca-da-chave-secreta-do-webhook)
- [Pagamento com os cartões de teste](#pagamento-com-os-cartões-de-teste)
- [Cobrança presa](#cobrança-presa)
- [Consulta da order pelo checkoutId](#consulta-da-order-pelo-checkoutid)

Os comandos `kubectl` pressupõem o `kubeconfig` do cluster EKS, configurado com as credenciais AWS (`aws eks update-kubeconfig --name <nome do cluster>`), e os comandos `gh`, o GitHub CLI autenticado com acesso de administração ao repositório.

## Contas de teste

O teste usa duas contas de teste do Mercado Pago, criadas uma vez em **Suas integrações → Contas de teste** de uma conta real do grupo:

| Conta | Papel |
| --- | --- |
| Vendedora | Dona da aplicação que o Billing usa. O Mercado Pago a cria junto com a primeira aplicação do Checkout Pro da conta real |
| Compradora | Paga a cobrança na página do Checkout Pro. Precisa ser outra conta de teste, do mesmo país da vendedora |

Entre no Mercado Pago com o usuário e a senha da conta vendedora (numa janela anônima; o código de verificação de 6 dígitos fica na tabela de Contas de teste) e use a aplicação dela em **Suas integrações**: o access token fica em **Credenciais**, e a chave secreta, em **Configuração de webhooks**, onde o evento **Order (Mercado Pago)** precisa estar marcado. Numa conta de teste, a aplicação tem um único par de credenciais, sem abas Teste e Produção. Na conta real, a aba **Teste** mostra o mesmo token da vendedora; a aba **Produção** é a da conta real e cobra dinheiro de verdade: nunca a use no Billing.

Para conferir o dono do token antes de gravá-lo, sem que ele apareça na tela nem no histórico:

```powershell
# Pede o token sem exibi-lo e mostra o id, o apelido e o país do dono; o apelido de uma conta de teste começa com TESTUSER e o país do Brasil é MLB
$t = Read-Host -AsSecureString "Token"; $p = [System.Net.NetworkCredential]::new('', $t).Password; (Invoke-RestMethod https://api.mercadopago.com/users/me -Headers @{ Authorization = "Bearer $p" }) | Select-Object id, nickname, site_id; Remove-Variable t, p
```

As orders criadas com uma credencial de conta de teste são de teste (o id começa com `ORDTST`), e **um pagamento de teste não dispara o webhook sozinho**. A notificação no sandbox sai pelo botão **Simular notificação** da tela de webhooks: com o evento **Order (Mercado Pago)** e o `checkoutId` da cobrança no **Data ID**, o Mercado Pago envia à URL cadastrada uma notificação assinada com a chave da aplicação, e o Billing consulta a order e encerra a cobrança pelo status real dela ([Pagamento com os cartões de teste](#pagamento-com-os-cartões-de-teste)).

Para usar essas credenciais no stack local, grave-as no `app/.env` (`MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`) e recrie o container da API ([Como executar localmente › Mercado Pago](local-setup.md#mercado-pago)). O webhook só chega ao cluster, pela URL cadastrada no painel.

## Credenciais no GitHub

No cluster, as duas credenciais são secrets do repositório no environment `production`. O CD confere que não estão vazias e as aplica no Secret `mercadopago` do namespace `billing` ([CI/CD › Secrets e variables](ci-cd.md#secrets-e-variables)).

```bash
# Gravar o access token da aplicação da conta vendedora de teste (o gh pede o valor)
gh secret set MERCADOPAGO_ACCESS_TOKEN --env production -R FIAP-15SOAT/oficina-mecanica-billing-service

# Gravar a chave secreta do webhook, copiada da tela de Webhooks do painel (o gh pede o valor)
gh secret set MERCADOPAGO_WEBHOOK_SECRET --env production -R FIAP-15SOAT/oficina-mecanica-billing-service

# Conferir que os dois secrets existem no environment production
gh secret list --env production -R FIAP-15SOAT/oficina-mecanica-billing-service
```

O Secret do cluster só muda no próximo CD, e os pods leem o Secret ao subir. Depois de trocar um secret:

```bash
# Rodar o CD na main, que reaplica o Secret mercadopago
gh workflow run cd.yml -R FIAP-15SOAT/oficina-mecanica-billing-service --ref main

# Reiniciar os pods do Billing para lerem o Secret novo
kubectl rollout restart deployment/billing-service -n billing

# Esperar os pods novos ficarem prontos
kubectl rollout status deployment/billing-service -n billing
```

**Antes de trocar de aplicação no Mercado Pago, cancele as cobranças `PENDING`** ([Cobrança presa](#cobrança-presa)). Uma order só é visível para o token da aplicação que a criou: depois da troca, a consulta responde `404 order_not_found`, o cancelamento pela API do Billing responde 503 e a cobrança fica `PENDING`, bloqueando outra cobrança da mesma OS. Trocar só a chave secreta, na mesma aplicação, não tem esse efeito.

## URL do webhook no painel

O Mercado Pago só notifica a URL cadastrada no painel da aplicação: o Checkout Pro via Orders não aceita uma URL por cobrança. A URL é a do API Gateway da solução, que muda quando o ambiente é recriado. Por isso, **a cada sessão em que se testa pagamento**, atualize a URL no painel.

```bash
# Ler a URL pública do API Gateway da solução
aws apigatewayv2 get-apis --query "Items[?Name=='apigw-oficina-mecanica'].ApiEndpoint | [0]" --output text
```

1. Monte a URL do webhook: `<ApiEndpoint>/webhooks/mercadopago`.
2. Logado como a conta vendedora de teste, abra **Suas integrações → aplicação → Configuração de webhooks**, cole a URL em **URL de produção**, mantenha o evento **Order (Mercado Pago)** marcado e salve.
3. Faça um pagamento de teste e simule a notificação dele ([Pagamento com os cartões de teste](#pagamento-com-os-cartões-de-teste)); depois confira no log do Billing que a notificação chegou e passou na assinatura:

```bash
# Procurar no log do Billing as notificações recebidas e as recusadas pela assinatura
kubectl logs deployment/billing-service -n billing --since=15m | grep -E 'payment\.webhook\.(received|invalid_signature)'
```

Cada notificação aceita gera uma linha `payment.webhook.received` e conta `oficina.payment.webhook.received` com `outcome = valid`. Nenhuma linha depois da simulação indica a URL errada no painel; linhas `payment.webhook.invalid_signature` indicam a chave errada ([Troca da chave secreta do webhook](#troca-da-chave-secreta-do-webhook)).

## Troca da chave secreta do webhook

A chave secreta é da aplicação, e não da URL: ela só muda quando alguém clica em **Redefinir** na tela de webhooks, e trocar a URL a cada sessão não a muda.

Com a chave nova:

1. Copie a chave da tela de Webhooks.
2. Grave-a em `MERCADOPAGO_WEBHOOK_SECRET` e reinicie os pods, como em [Credenciais no GitHub](#credenciais-no-github).
3. Simule uma notificação e confira o log, como em [URL do webhook no painel](#url-do-webhook-no-painel).

Enquanto o Billing usa a chave antiga, toda notificação responde 401 e registra `payment.webhook.invalid_signature`: as cobranças não mudam até o Mercado Pago repetir a notificação com a chave nova configurada, ou até o funcionário cancelar a cobrança ([Cobrança presa](#cobrança-presa)).

## Pagamento com os cartões de teste

Abra o `checkoutUrl` da cobrança logado com a **conta compradora de teste** e pague com um dos [cartões de teste do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards), por exemplo o Mastercard `5480 8328 0103 3311`, código de segurança `123` e vencimento `11/30`. O nome do titular decide o resultado, com o CPF `12345678909`:

| Nome do titular | Resultado no Mercado Pago | Efeito no Billing |
| --- | --- | --- |
| `APRO` | Pagamento aprovado; a order fica `processed` | O webhook leva a cobrança a `APPROVED` e publica `billing.payment.approved` |
| `OTHE` | Pagamento recusado por erro geral | A cobrança só muda se a order terminar `failed`: então vai a `REJECTED` e publica `billing.payment.failed` (`REJECTED`). Enquanto a order seguir aberta, o comprador pode tentar de novo e a cobrança continua `PENDING` |

O efeito no Billing só acontece com a notificação: depois de pagar, simule-a na tela de webhooks da aplicação (**Simular notificação**, evento **Order (Mercado Pago)**, **Data ID** igual ao `checkoutId`), porque um pagamento de teste não dispara o webhook sozinho ([Contas de teste](#contas-de-teste)).

O checkout de teste também gera boleto (com um CEP válido no endereço). Um boleto gerado e não pago deixa a order `action_required`, e a cobrança continua `PENDING`; o cancelamento pela API do Billing é aceito pelo Mercado Pago nesse estado e encerra a cobrança `CANCELLED`. O checkout de teste não oferece Pix.

Confira a cobrança pela API (`GET /api/payments/:id`) e a order pelo `checkoutId` ([Consulta da order pelo checkoutId](#consulta-da-order-pelo-checkoutid)).

## Cobrança presa

Uma cobrança fica presa em `PENDING` quando o webhook não chega: URL ou chave errada no painel, ou uma order que expirou sem notificação. Ela impede outra cobrança da mesma OS, porque cada OS tem no máximo uma cobrança `PENDING`.

**Pela API do Billing.** O cancelamento consulta o Mercado Pago e encerra a cobrança pelo status real da order. No cluster, abra um túnel para o Service do Billing; no stack local, a API já responde em `http://localhost:3002`.

```bash
# Abrir um túnel da porta 3002 local para o Service do Billing no cluster
kubectl port-forward -n billing svc/billing-service 3002:3000

# Cancelar a cobrança, com um token de funcionário ADMIN, ATTENDANT ou MECHANIC
curl -i -X POST http://localhost:3002/api/payments/<id da cobrança>/cancellations -H "Authorization: Bearer <token de funcionário>"
```

| Resposta | O que aconteceu | O que fazer |
| --- | --- | --- |
| 200, `status` `CANCELLED` | A order estava aberta e foi cancelada | Nada: `billing.payment.failed` (`CANCELLED`) foi publicado e a OS aceita outra cobrança |
| 200, `status` `EXPIRED`, `CANCELLED` ou `REJECTED` | A order já tinha encerrado sem pagamento e o webhook não chegou | Nada: a cobrança tem o status final e `billing.payment.failed` foi publicado. Confira a URL do webhook no painel |
| 409 "A cobrança não pode ser cancelada porque já foi paga" | O cliente pagou e o webhook não chegou | A cobrança foi a `APPROVED` e `billing.payment.approved` foi publicado. Confira a URL do webhook no painel |
| 409 "A cobrança não pode ser cancelada enquanto o pagamento iniciado pelo cliente..." | O Mercado Pago recusou o cancelamento porque há um pagamento em processamento (por exemplo, cartão em análise). Boleto gerado e não pago não causa esse 409: o cancelamento é aceito | Espere: a cobrança fecha quando o pagamento for confirmado ou expirar. Sem webhook, repita o cancelamento depois da expiração |
| 409 "Cobrança só pode ser cancelada no status PENDING..." | A cobrança já estava encerrada | Nada |
| 503 | O Mercado Pago não respondeu | Repita depois |

**Pelo painel do Mercado Pago.** Também é possível cancelar a order na conta vendedora de teste, pelo `checkoutId` da cobrança. Com o webhook funcionando, a notificação leva a cobrança a `CANCELLED`; sem ele, o cancelamento pela API do Billing, depois, encontra a order `canceled` e encerra a cobrança com 200.

**Order estornada.** Se o 409 de pagamento em andamento continuar depois da expiração da order, consulte a order como em [Consulta da order pelo checkoutId](#consulta-da-order-pelo-checkoutid). Uma order `refunded` (pagamento devolvido ao comprador) ou `charged_back` (pagamento contestado pelo comprador no cartão) com a cobrança ainda `PENDING` quer dizer que a notificação do pagamento não chegou e que o pagamento foi desfeito depois. O Billing só registra esse estado: nenhuma rota encerra a cobrança, e a OS não aceita outra cobrança enquanto ela estiver `PENDING`. Leve o caso ao grupo.

Para achar a cobrança presa de uma OS:

```bash
# Listar as cobranças pendentes de uma OS
curl -s "http://localhost:3002/api/payments?workOrderId=<id da OS>&status=PENDING" -H "Authorization: Bearer <token de funcionário>"
```

## Consulta da order pelo checkoutId

O `checkoutId` do `Payment` é o id da order no Mercado Pago, e o `external_reference` da order é o id do `Payment`. Para ver o status real da order:

```bash
# Consultar a order no Mercado Pago com o access token da aplicação
curl -s https://api.mercadopago.com/v1/orders/<checkoutId> -H "Authorization: Bearer <access token>"
```

O Billing traduz o status da order como em [Arquitetura › Porta e adaptador](architecture.md#porta-e-adaptador): `created`, `action_required` e `processing` mantêm a cobrança `PENDING`; `processed`, `expired`, `canceled` e `failed` a encerram; `refunded` e `charged_back` só são registrados no log (`payment.checkout_reversed`), sem estorno no Billing.
