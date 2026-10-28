# ADR 0004: Materialização da credencial do banco no CD

## Status

Aceito — 2026-10-27

## Contexto

O banco do Billing é um Amazon RDS PostgreSQL próprio, com a master password gerada e guardada pelo RDS no Secrets Manager. O cache é um ElastiCache for Valkey próprio, com o token de autenticação num secret do Secrets Manager criado pelo Terraform. A aplicação e o Job de migração rodam no EKS e recebem a conexão por variáveis: `DATABASE_URL`, no formato do Prisma, e `CACHE_URL`.

Endpoint, senha e token não devem ser copiados para secrets ou variables do GitHub nem lidos pelos Pods direto da AWS. O CD já autentica na AWS, configura o `kubectl` e ordena a migração antes do deploy: é a fronteira que tem contexto para traduzir os metadados da AWS no formato que o Kubernetes e o Prisma esperam.

## Decisão

O job `prepare-deploy` do CD materializa as credenciais antes da migração:

1. **Banco.** Recebe só o identificador `vars.RDS_INSTANCE_IDENTIFIER`. Espera a instância `available` com o `MasterUserSecret` `active`, lê endpoint, porta, `DBName` e `MasterUsername`, lê o estágio `AWSCURRENT` do secret e confere que o `username` é o master. Um trecho Node.js inline no `cd.yml` monta a URL com `encodeURIComponent` no usuário e na senha e `schema=public&sslmode=require&uselibpqcompat=true`, mascara senha, URL e base64, preenche o documento `database-credentials` de `k8s/01-secrets.yaml` e o aplica por stdin.
2. **Cache.** Recebe só `vars.CACHE_REPLICATION_GROUP_ID`. Espera o replication group disponível, lê o endpoint primário e o secret `<id>-auth-token`, exige um token alfanumérico (sem percent-encoding) e aplica `CACHE_URL` (`rediss://`) no documento `cache-credentials`, por pipe.
3. **Chave pública do token.** `STAFF_JWT_PUBLIC_KEY` e `STAFF_JWT_KEY_ID` vêm de secrets da organização e vão para o documento `jwt-public-keys`, junto com o ConfigMap, num step separado. Não há chave privada no Billing.

Nenhum valor sensível passa por argumento de processo, arquivo renderizado, artifact, output de job ou log. O Job de migração e o Deployment consomem a mesma chave `DATABASE_URL` de `database-credentials`. Reexecutar o CD com a credencial inalterada é idempotente.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Copiar senha, host e ARN para secrets ou variables do GitHub | Configuração direta, mas duplica a origem da verdade e exige sincronização manual | — |
| External Secrets Operator | Sincronização contínua, mas traz controller, CRDs e IAM de workload sem necessidade nesta entrega | A rotação automática entrar no escopo |
| Secrets Store CSI Driver com ASCP | Montagem direta da AWS, mas traz driver e provider e muda o contrato de montagem e refresh dos Pods | — |
| Pods ou Job lendo a AWS direto | Sem intermediário, mas exige credencial e permissão do Secrets Manager no runtime; o ambiente não permite criar role para o Pod | O ambiente permitir IRSA ou Pod Identity |
| Terraform da aplicação lendo o `SecretString` | Tudo no IaC, mas leva a credencial ao Terraform e ao state | — |
| Senha do cache em texto no state | Mais simples, mas o state passaria a guardar segredo, ao contrário do RDS | — |
| Script Node.js num arquivo à parte | Testável isolado, mas é um arquivo a mais para uma operação linear que cabe no workflow | — |

## Consequências

### Positivas

- O RDS e o Secrets Manager continuam a única origem da senha e do token.
- Nenhum endpoint ou segredo é mantido no GitHub, além da chave pública do token.
- Migração e aplicação recebem exatamente a mesma conexão, com TLS.

### Negativas e limites

- O CD depende das APIs do RDS, do ElastiCache e do Secrets Manager e falha antes da migração se algum metadado faltar.
- O valor fica num Secret do Kubernetes, sujeito às proteções do cluster; esta decisão não acrescenta criptografia do etcd.
- Sem rotação automática: trocar só a credencial, com a mesma imagem, não renova os Pods.

## Referências

- [CI/CD › Workflow de CD](../ci-cd.md#2-workflow-de-cd-cdyml)
- [AWS — `DescribeDBInstances`](https://docs.aws.amazon.com/cli/latest/reference/rds/describe-db-instances.html)
- [AWS — `GetSecretValue`](https://docs.aws.amazon.com/cli/latest/reference/secretsmanager/get-secret-value.html)
- [Kubernetes — Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Prisma — Connection URLs](https://www.prisma.io/docs/orm/reference/connection-urls)
