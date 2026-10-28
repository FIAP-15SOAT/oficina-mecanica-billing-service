# 🧩 Modelo C4 — Billing Service

Este diretório documenta a API do Billing com o [modelo C4](https://c4model.com), no nível de Componente: as peças internas do container **API do Billing** e como elas se ligam ao banco, ao cache, à mensageria e aos outros serviços da oficina.

## Índice

- [Convenções](#convenções)
- [Nível 3 — Componente da API do Billing](#nível-3--componente-da-api-do-billing)
- [Documentação relacionada](#documentação-relacionada)

## Convenções

- **Tipo explícito em todo elemento.** Cada elemento declara o tipo entre colchetes (`[Pessoa]`, `[Sistema Externo]`, `[Container Externo: tecnologia]`, `[Componente: tecnologia]`).
- **Ícone de componente.** Cada componente leva o ícone UML clássico (dois retângulos), na paleta azul dos demais elementos.
- **Tecnologia só ao cruzar fronteira.** As setas entre componentes do mesmo container não levam tecnologia; ela aparece nas relações com o funcionário, o Kubernetes, o banco, o cache, a mensageria e os outros serviços.
- **Imagem com o fonte.** A imagem é gerada pelo PlantUML com a biblioteca [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) v2.14.0, e o fonte do diagrama fica embutido no próprio PNG.

## Nível 3 — Componente da API do Billing

<p align="center"><img src="images/c4-component.png" alt="Diagrama de Componente C4 da API do Billing: o Funcionário apresenta o token de funcionário ao componente Guards/Segurança; o Kubernetes consulta o Health, que verifica a conexão com o banco; a Mensageria lê e apaga o outbox pelos Repositories e publica no SNS e consome a fila billing.fifo; os Repositories gravam o outbox no PostgreSQL; o Cache usa o ElastiCache Valkey; e o Cliente Interno chama as rotas /internal dos outros serviços da oficina" width="100%"></p>

O Billing ainda não tem módulo de negócio: a API expõe só os health checks e o Swagger. Os **seis componentes transversais** do kit já estão no container, prontos para os orçamentos, as cobranças e os pagamentos. Destaques do fluxo: o **Funcionário** apresenta o token emitido pelo Identity ao componente **Guards / Segurança**, que o valida pela chave pública, sem consultar outro serviço; o **Kubernetes** consulta o **Health**, que verifica só o banco; e a **Mensageria** publica as linhas do outbox gravadas pelos **Repositories** e consome a fila `billing.fifo`.

Os módulos de negócio, quando chegarem, passam pelo **Guards / Segurança** e persistem pelos **Repositories**; usam o **Cache** e o **Cliente Interno** pelas portas da camada de aplicação.

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| **Guards / Segurança** | NestJS Guards | `AuthenticationGuard` global que nega por padrão (token de funcionário, salvo `@Public()`), `JwtStrategy` RS256 pela chave pública e `RolesGuard` (RBAC) |
| **Health** | NestJS Module | `GET /api/health/live` sem I/O e `GET /api/health/ready` com `SELECT 1`, consumidas pelas probes do Kubernetes |
| **Repositories** | Prisma | Unit of Work e repositório do outbox, gravado na mesma transação da mudança de estado |
| **Mensageria** | NestJS Module · AWS SDK | Relay do outbox para o SNS FIFO e consumidor da fila SQS `billing.fifo`, com o span `CONSUMER` |
| **Cache** | NestJS Module · ioredis | Porta `ICache` sobre o Valkey, cache-aside que falha aberto |
| **Cliente Interno** | @nestjs/axios | Chamadas REST às rotas `/internal` dos outros serviços, com prazo, `x-request-id` e `traceparent` |

| Elemento externo | Tipo | Papel |
|---|---|---|
| **Funcionário** | Pessoa | Administrador, mecânico ou atendente, com o token emitido pelo Identity |
| **Kubernetes** | Sistema externo | Executa as probes de inicialização, vivacidade e prontidão do pod |
| **Banco de Dados** | Container externo | Amazon RDS PostgreSQL 18 do Billing, com a tabela `outbox` |
| **Cache Distribuído** | Container externo | Amazon ElastiCache Valkey 9.1 do Billing |
| **Mensageria AWS** | Container externo | Tópico `oficina-events.fifo`, fila `billing.fifo` e a DLQ `billing-dlq.fifo` |
| **Serviços da Oficina** | Sistema externo | Work Order, Identity e Inventory, chamados pela rede do cluster |

## Documentação relacionada

- [Arquitetura](../architecture.md)
- [ADR 0005 — Mensageria SNS/SQS FIFO com outbox](../adr/0005-mensageria-sns-sqs-fifo-com-outbox.md)
- [ADR 0006 — Cache do dono no ElastiCache](../adr/0006-cache-do-dono-no-elasticache.md)
