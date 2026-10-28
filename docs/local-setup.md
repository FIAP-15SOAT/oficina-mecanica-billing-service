# 💻 Como executar localmente

Setup com a API na máquina e a infraestrutura no Docker, portas locais, chave do token de funcionário e variáveis de ambiente. Para subir tudo em containers com um comando, veja o Quick Start no [README](../README.md#-quick-start).

## Índice

- [Portas locais](#portas-locais)
- [Setup local](#setup-local)
- [Chave do token de funcionário](#chave-do-token-de-funcionário)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Telemetria e logs em desenvolvimento](#telemetria-e-logs-em-desenvolvimento)

## Portas locais

Cada serviço da solução publica no host as próprias portas, para os stacks locais subirem juntos. A porta no host é a padrão somada ao índice do contexto:

| Contexto | Índice | API | PostgreSQL | Valkey | LocalStack |
|---|---|---|---|---|---|
| work-order | 0 | 3000 | 5432 | 6379 | 4566 |
| identity | 1 | 3001 | 5433 | 6380 | 4567 |
| **billing** | **2** | **3002** | **5434** | **6381** | **4568** |
| inventory | 3 | 3003 | 5435 | 6382 | 4569 |

Só o lado do host muda. Dentro dos containers, a API escuta na 3000 e as URLs entre containers usam as portas padrão (`postgres:5432`, `valkey:6379`, `localstack:4566`). O Valkey e o LocalStack são publicados só em `127.0.0.1`.

| Onde a API roda | URL da API | `DATABASE_URL` | `CACHE_URL` | `AWS_ENDPOINT_URL` |
|---|---|---|---|---|
| No container (`docker compose up`) | `http://localhost:3002` | `postgres:5432` (do compose) | `valkey:6379` (do compose) | `http://localstack:4566` (do compose) |
| Na máquina (`npm run start:dev`) | `http://localhost:3002` | `localhost:5434` (do `.env`) | `localhost:6381` (do `.env`) | `http://localhost:4568` (do `.env`) |

O `.env.example` já traz os valores da execução na máquina, com `PORT=3002`.

## Setup local

Neste modo a API roda na máquina com `npm run start:dev`, e só o PostgreSQL 18, o Valkey 9.1 e o LocalStack 4.14.0 sobem no Docker. Pré-requisitos: Node.js 24.9 ou mais novo, Docker com Docker Compose e OpenSSL.

Toda a aplicação vive em `app/`: rode os comandos abaixo, e todos os `npm`, `prisma` e `docker compose`, a partir dessa pasta.

```bash
# Entrar na pasta da aplicação
cd app

# Instalar as dependências
npm install

# Criar o .env a partir do exemplo
cp .env.example .env

# Gerar um par RS256 local para o token de funcionário
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out staff.pem

# Extrair a chave pública do par
openssl pkey -in staff.pem -pubout -out staff.pub.pem

# Acrescentar a chave pública ao .env, numa linha só
node -e "console.log('STAFF_JWT_PUBLIC_KEY=' + JSON.stringify(require('node:fs').readFileSync('staff.pub.pem', 'utf8')))" >> .env

# Apagar os arquivos do par (nenhuma chave é versionada)
rm staff.pem staff.pub.pem

# Subir só a infraestrutura, sem o container da API
docker compose up postgres valkey localstack -d --wait

# Aplicar as migrations e gerar o Prisma Client
npm run db:setup

# Iniciar a aplicação em modo watch
npm run start:dev
```

Depois da subida:

- **API:** `http://localhost:3002`
- **Swagger:** `http://localhost:3002/api/docs`
- **LocalStack (SNS/SQS):** `http://localhost:4568`

### Valkey

O Valkey do compose faz o papel do ElastiCache. Ele exige a senha `valkey`, que o `CACHE_URL` do `.env.example` já traz. Com o Valkey parado, a API continua respondendo e a prontidão continua `200`: o cache falha aberto.

### LocalStack

O LocalStack emula o SNS e o SQS. Ao subir, o `app/localstack/init-topology.sh` cria o tópico `oficina-events.fifo`, as filas FIFO de cada serviço com as DLQs (`maxReceiveCount` 5) e as assinaturas com as filter policies por `type`; o container só fica saudável depois que o script termina. O script é cópia do repositório de mensageria da solução e não é editado aqui.

A API acha o LocalStack por `AWS_ENDPOINT_URL`, que o próprio SDK da AWS lê; `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` aceitam qualquer valor (`test`). No cluster, `AWS_ENDPOINT_URL` não existe e o SDK usa os endpoints da região.

## Chave do token de funcionário

O Billing só valida tokens: ele recebe a chave **pública** do par RS256 e nunca a privada. Os comandos do setup geram um par de 2048 bits, acrescentam ao `.env` a `STAFF_JWT_PUBLIC_KEY` numa linha só, entre aspas e com `\n` literal, e apagam os arquivos `.pem`; o `STAFF_JWT_KEY_ID=staff-local` já vem do `.env.example`. O `.gitignore` ignora `*.pem` e o `.env`.

Sem a chave, a API não sobe e o `docker compose` para com a mensagem `Gere as chaves RS256 de funcionário conforme docs/local-setup.md`.

Para aceitar os tokens emitidos por outro serviço local, como o Work Order, use a mesma chave pública dele: copie a linha `STAFF_JWT_PUBLIC_KEY` do `.env` daquele serviço para o `.env` do Billing no lugar da gerada. O `kid`, o emissor e a audiência locais já são os mesmos (`staff-local`, `oficina-identity` e `oficina-services`).

No cluster, a chave pública e o `kid` vêm de secrets da organização no GitHub, aplicados pelo CD no Secret `jwt-public-keys` (ver [CI/CD › Secrets e variables](ci-cd.md#secrets-e-variables)).

## Variáveis de ambiente

O `app/.env.example` tem todas as variáveis com comentários. As obrigatórias impedem a API de subir quando faltam.

| Variável | Obrigatória | Valor local | Para que serve |
|---|---|---|---|
| `PORT` | Não | `3002` | Porta HTTP da API (3000 no container) |
| `NODE_ENV` | Não | `development` | Ambiente; `production` liga a janela de drain no encerramento |
| `TZ` | Não | `America/Sao_Paulo` | Fuso do processo |
| `DATABASE_URL` | Sim | `postgresql://postgres:postgres@localhost:5434/billing?schema=public` | Conexão do Prisma |
| `STAFF_JWT_PUBLIC_KEY` | Sim | Gerada no setup | Chave pública RS256 do token de funcionário |
| `STAFF_JWT_KEY_ID` | Sim | `staff-local` | `kid` aceito no cabeçalho do token |
| `STAFF_JWT_ISSUER` | Sim | `oficina-identity` | `iss` aceito |
| `STAFF_JWT_AUDIENCE` | Sim | `oficina-services` | `aud` aceita |
| `AWS_REGION` | Lida pelo SDK | `us-east-1` | Região do SNS e do SQS; sem ela, as chamadas à AWS falham |
| `AWS_ENDPOINT_URL` | Só local | `http://localhost:4568` | Endpoint do LocalStack |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Só local | `test` | Credenciais do LocalStack |
| `BILLING_QUEUE_NAME` | Sim | `billing.fifo` | Fila consumida |
| `MESSAGING_TOPIC_ARN` | Sim | `arn:aws:sns:us-east-1:000000000000:oficina-events.fifo` | Tópico onde o relay publica |
| `CACHE_URL` | Sim | `redis://:valkey@localhost:6381` | Valkey; `rediss://` com senha no cluster |
| `CACHE_TTL_SECONDS` | Não | `43200` | Validade das entradas; inteiro maior que zero (vazio = 12 h) |
| `ALLOWED_ORIGINS` | Não | `http://localhost:3002` | Origens do CORS, separadas por vírgula |
| `LOG_LEVEL` | Não | `info` | Nível do log |
| `OTEL_SERVICE_NAME`, `OTEL_SERVICE_NAMESPACE` | Não | `oficina-mecanica-billing-service`, `oficina-mecanica` | Identidade do serviço no log e no trace |
| `TRUSTED_PROXY_CIDRS` | Não | vazio | Proxies confiáveis para `X-Forwarded-For` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Não | vazio | Liga a telemetria; vazio a deixa desligada |

`SERVICE_VERSION` não é configurada por env: ela é gravada na imagem pelo `ARG SERVICE_VERSION` do `Dockerfile`, com o SHA do commit no CD, e vale `dev` fora do container.

## Telemetria e logs em desenvolvimento

`OTEL_EXPORTER_OTLP_ENDPOINT` vazio deixa a telemetria desligada: o preload retorna cedo e nenhum módulo do SDK é carregado. Para exercitá-la, aponte a variável para um coletor OTLP/HTTP (por exemplo `http://localhost:4318`) e use `npm run start:prod` depois do `npm run build`, que carrega o preload como a imagem. O `npm run start:dev` não carrega o preload.

O processo sempre escreve JSON no stdout. O `start:dev` passa a saída pelo `pino-pretty` com `--timestampKey timestamp --messageKey message`, porque o envelope usa esses nomes; o `pino-pretty` nunca é importado pelo código.
