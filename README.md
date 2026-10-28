<div align="center">

# 💳 Billing Service

**Orçamentos, cobranças e pagamentos da oficina mecânica.**

![Node](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Cobertura unitária](https://img.shields.io/badge/cobertura-100%25-brightgreen)

</div>

## 📋 Sobre

Projeto acadêmico da pós-graduação em Arquitetura de Software da FIAP (turma 15SOAT). A solução da oficina mecânica é formada pelos serviços Work Order, Identity, Billing e Inventory, cada um dono do próprio banco e do próprio cache, que conversam por REST interno e por mensagens SNS/SQS FIFO publicadas a partir de um outbox transacional.

Este repositório é o **Billing**. Ele será o dono dos orçamentos, das cobranças e dos pagamentos pelo Mercado Pago, que chegam nas próximas entregas. Hoje o serviço está publicado vazio, sem regra de negócio: expõe só os health checks e o Swagger, com o kit comum dos serviços pronto para receber o domínio.

- **Kit comum**: Clean Architecture com cerca de camadas no ESLint, logs JSON estruturados, OpenTelemetry, health checks, outbox e relay para o SNS, consumidor da fila `billing.fifo`, cache Valkey e cliente HTTP interno.
- **Autenticação**: só o token de funcionário (JWT RS256 emitido pelo Identity), validado localmente pela chave pública, sem consulta a outro serviço. O token de cliente é recusado.
- **Entrega**: imagem publicada no Amazon ECR e implantada no Amazon EKS, no namespace `billing`, pelo próprio CD.

## 🧰 Stack

- **Runtime**: Node.js 24 + TypeScript 6.0
- **Framework**: NestJS 12
- **ORM**: Prisma 7.10 (driver `@prisma/adapter-pg`, client gerado em `prisma/generated/`)
- **Banco de dados**: PostgreSQL 18 (Amazon RDS no cluster)
- **Mensageria**: Amazon SNS FIFO + SQS FIFO (`@aws-sdk/client-sns`, `@aws-sdk/client-sqs`, `sqs-consumer`), com outbox transacional no PostgreSQL; LocalStack 4.14.0 em desenvolvimento
- **Cache**: Valkey 9.1 (Amazon ElastiCache no cluster) via `ioredis`
- **Chamadas internas**: REST pela rede do cluster, com `@nestjs/axios`
- **Autenticação**: `passport-jwt` com o token de funcionário RS256
- **Observabilidade**: logs JSON no stdout com `pino` + `nestjs-pino`, traces e métricas pelo SDK do OpenTelemetry (desligado com o endpoint vazio), coletados pelo Datadog no cluster
- **Documentação da API**: Swagger/OpenAPI em `/api/docs`
- **Testes**: Jest 30 + ts-jest (unitários com mocks tipados; E2E com Testcontainers 12, PostgreSQL 18, Valkey 9.1 e LocalStack 4.14.0)
- **Qualidade e segurança**: SonarQube Cloud (SAST) e OWASP ZAP (DAST)
- **Containerização**: Docker (multi-stage `node:24-alpine`) + Docker Compose
- **Linting**: ESLint 9 + Prettier 3

## ✅ Pré-requisitos

- Node.js 24.9 ou mais novo, com npm
- Docker com Docker Compose
- OpenSSL, para gerar a chave RS256 local
- Git

## 🚀 Quick Start

Sobe o PostgreSQL, o Valkey, o LocalStack (SNS e SQS), a migração e a API em containers.

```bash
# Clonar o repositório
git clone https://github.com/FIAP-15SOAT/oficina-mecanica-billing-service.git

# Entrar na pasta da aplicação
cd oficina-mecanica-billing-service/app

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

# Subir todos os serviços em background e esperar que fiquem saudáveis
docker compose up -d --build --wait

# Conferir que a API e o banco respondem: 200 {"status":"ok"}
curl -i http://localhost:3002/api/health/ready
```

Depois da subida:

- **API:** `http://localhost:3002`
- **Swagger:** `http://localhost:3002/api/docs`
- **LocalStack (SNS/SQS):** `http://localhost:4568`

```bash
# Acompanhar os logs da API
docker compose logs -f api

# Parar os containers, mantendo o volume do banco
docker compose stop
```

As portas no host seguem a tabela por contexto da solução, para o Billing subir junto com os outros serviços: veja [Como executar localmente › Portas locais](docs/local-setup.md#portas-locais). O setup com a API fora do container, as variáveis de ambiente e a chave do token estão no mesmo documento.

## ⚙️ Comandos

Rode todos os comandos a partir de `app/`: não há `package.json` na raiz do repositório.

| Comando | Descrição |
|---|---|
| `npm run start:dev` | Inicia em modo watch, com os logs formatados pelo `pino-pretty` |
| `npm run start:prod` | Inicia o build com o preload do OpenTelemetry (`node --require ./dist/src/otel.js dist/src/main`), como a imagem |
| `npm run build` | Compila o projeto |
| `npm run lint` | ESLint com auto-fix, incluindo a cerca de camadas |
| `npm run format` | Formata o código com Prettier |
| `npm test` | Testes unitários |
| `npm run test:cov` | Testes unitários com cobertura (falha abaixo de 100%) |
| `npm run test:e2e` | Testes E2E com Testcontainers |
| `npm run test:e2e:cov` | Testes E2E com cobertura |
| `npm run test:smoke` | Smoke do preload de telemetria, fora do Jest (precisa do `build`) |
| `npm run prisma:generate` | Gera o Prisma Client em `prisma/generated/` |
| `npm run prisma:migrate` | Cria e aplica uma migration (desenvolvimento) |
| `npm run prisma:migrate:prod` | Aplica as migrations (`migrate deploy`) |
| `npm run db:setup` | `migrate deploy` + `generate` (primeiro setup) |
| `npm run db:reset` | Recria o banco do zero (bloqueado em `production` e `staging`) |

O serviço não tem seed: a migração só cria o schema.

## 🏛️ Arquitetura

Clean Architecture com quatro camadas e dependências apontando só para dentro. `domain/`, `application/` e `interface-adapters/` não importam NestJS, Prisma, OpenTelemetry, AWS SDK nem `ioredis`; a cerca do ESLint falha o lint na violação. O kit de infraestrutura (logging, telemetria, health, mensageria, cache, cliente interno, guard) é o mesmo dos outros serviços NestJS da solução.

➡️ Detalhes em **[Arquitetura](docs/architecture.md)**.

## 🌐 Ecossistema de repositórios

| Repositório | Responsabilidade |
|---|---|
| [oficina-mecanica-work-order-service](https://github.com/FIAP-15SOAT/oficina-mecanica-work-order-service) | Serviço Work Order: ordens de serviço, clientes, veículos e orquestração das Sagas |
| [oficina-mecanica-identity-service](https://github.com/FIAP-15SOAT/oficina-mecanica-identity-service) | Serviço Identity: usuários, login de funcionário e emissão do token |
| **[oficina-mecanica-billing-service](https://github.com/FIAP-15SOAT/oficina-mecanica-billing-service)** *(este repositório)* | Serviço Billing: orçamentos, cobranças e pagamentos |
| [oficina-mecanica-inventory-service](https://github.com/FIAP-15SOAT/oficina-mecanica-inventory-service) | Serviço Inventory: catálogo, estoque e reservas |
| [oficina-mecanica-lambda-customer-auth](https://github.com/FIAP-15SOAT/oficina-mecanica-lambda-customer-auth) | Lambda de login do cliente por CPF |
| [oficina-mecanica-lambda-notification](https://github.com/FIAP-15SOAT/oficina-mecanica-lambda-notification) | Lambda de envio de e-mail |
| [oficina-mecanica-infra-base](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-base) | Rede e scripts de ambiente (Terraform) |
| [oficina-mecanica-infra-k8s](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-k8s) | EKS, namespaces, ECR, NLB, Datadog Agent e MailHog (Terraform) |
| [oficina-mecanica-infra-messaging](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-messaging) | Tópico SNS e filas SQS FIFO (Terraform) |
| [oficina-mecanica-infra-database-work-order](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-database-work-order) | RDS e ElastiCache do Work Order (Terraform) |
| [oficina-mecanica-infra-database-identity](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-database-identity) | RDS e ElastiCache do Identity (Terraform) |
| [oficina-mecanica-infra-database-billing](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-database-billing) | RDS e ElastiCache do Billing (Terraform) |
| [oficina-mecanica-infra-database-inventory](https://github.com/FIAP-15SOAT/oficina-mecanica-infra-database-inventory) | RDS e ElastiCache do Inventory (Terraform) |
| [oficina-mecanica-api-gateway](https://github.com/FIAP-15SOAT/oficina-mecanica-api-gateway) | API Gateway HTTP API (Terraform) |
| [oficina-mecanica-custom-monitoring](https://github.com/FIAP-15SOAT/oficina-mecanica-custom-monitoring) | Dashboards e monitores do Datadog (Terraform) |

## 📁 Estrutura do repositório

```text
.
├── .github/
│   ├── actions/setup-ci/        # Node, npm ci e prisma generate para os jobs
│   └── workflows/               # CI, CD, SAST e DAST
├── .zap/                        # Regras do scan do OWASP ZAP
├── app/
│   ├── src/
│   │   ├── domain/              # Contratos de repositório, catálogo de mensagens e enums
│   │   ├── application/         # Portas, exceções e catálogos de log e de métricas
│   │   ├── interface-adapters/  # Clean Controllers e Presenters (vazia por enquanto)
│   │   └── infrastructure/      # HTTP, persistência, mensageria, cache, clientes, logging e telemetria
│   ├── localstack/              # Topologia SNS/SQS criada no LocalStack
│   ├── prisma/                  # Schema e migrations
│   ├── test/                    # Unitários, E2E, smoke e helpers
│   ├── .env.example             # Referência de configuração local
│   ├── Dockerfile               # Imagem da API
│   ├── docker-compose.yml       # Stack local
│   └── package.json             # Dependências e comandos npm
├── collections/                 # Collection e environment do Postman
├── docs/
│   ├── adr/                     # Decisões arquiteturais
│   ├── c4/                      # Diagrama C4 de componentes
│   └── diagrams/                # Diagramas dos workflows
├── k8s/                         # Manifests aplicados pelo CD
├── .gitignore
└── README.md
```

## 📚 Documentação

| Documento | Conteúdo |
|---|---|
| 🏛️ [Arquitetura](docs/architecture.md) | Camadas, cerca, kit comum e diagrama de componentes (C4 nível 3) |
| 💻 [Como executar localmente](docs/local-setup.md) | Setup local, portas por contexto, chave do token e variáveis de ambiente |
| 🧪 [Testes](docs/testing.md) | Unitários, E2E com rotas de teste, badge de cobertura e Postman/Newman |
| 🧩 [Modelo C4](docs/c4/README.md) | Diagrama de componentes da API, com a descrição de cada componente |
| 🔄 [CI/CD](docs/ci-cd.md) | Workflows de CI, CD, SAST e DAST, secrets e variables |
| 📊 [SonarQube Cloud](https://sonarcloud.io/project/overview?id=FIAP-15SOAT_oficina-mecanica-billing-service) | Quality gate e cobertura do projeto |

### Decisões de arquitetura (ADRs)

| ADR | Decisão |
|---|---|
| [0001](docs/adr/0001-clean-architecture-em-camadas.md) | Clean Architecture em camadas, com cerca de ESLint |
| [0002](docs/adr/0002-pipelines-ci-cd-sast-dast-com-rollback.md) | Pipelines de CI, CD, SAST e DAST, com rollback e DAST com JWT de teste |
| [0003](docs/adr/0003-testcontainers-com-postgresql-valkey-e-localstack.md) | E2E com Testcontainers: PostgreSQL, Valkey e LocalStack |
| [0004](docs/adr/0004-materializacao-da-credencial-do-banco-no-cd.md) | Materialização da credencial do banco no CD |
| [0005](docs/adr/0005-mensageria-sns-sqs-fifo-com-outbox.md) | Mensageria SNS/SQS FIFO com outbox transacional |
| [0006](docs/adr/0006-cache-do-dono-no-elasticache.md) | Cache do dono no ElastiCache |

## 👥 Autores

- [Guilherme da Rocha Salvador](https://github.com/guilhermesalvador404)
- [Lucas Almeida da Silva](https://github.com/lucas-almeida-silva)
- [Ramoon Lincoln Barros Camacho](https://github.com/ramooncamacho)
- [Renan Santana Camacho](https://github.com/renancamacho)

## 📄 Licença

Projeto acadêmico (FIAP — 15SOAT), para fins educacionais. Sem licença aberta declarada (`UNLICENSED`).
