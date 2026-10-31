# ADR 0001: Clean Architecture em camadas, com cerca de ESLint

## Status

Aceito — 2026-10-27

## Contexto

O Billing vai concentrar regras de negócio com dinheiro e estado: orçamentos com itens e totais, aprovação e reversão, cobranças e pagamentos por um provedor externo. Essas regras precisam ser testáveis sem o framework web, sem o ORM e sem o SDK do provedor, e evoluir sem que a troca de uma ferramenta obrigue a reescrever a regra.

A solução tem quatro serviços NestJS (Work Order, Identity, Billing e Inventory). Quem trabalha em um precisa reconhecer a estrutura dos outros, e o kit de infraestrutura (logging, telemetria, health, mensageria, cache, cliente interno, guard) precisa ser o mesmo nos quatro.

## Decisão

O Billing segue a mesma Clean Architecture do Work Order, com quatro camadas e dependências apontando só para dentro:

- **`domain/`**: entidades, value objects, invariantes, contratos de repositório e o catálogo de mensagens. Livre de framework e ORM.
- **`application/`**: casos de uso, portas de entrada e de saída (`ILogger`, `IMetrics`, `ICache` e os gateways dos outros serviços) e catálogos de eventos e métricas. Livre de framework e ORM.
- **`interface-adapters/`**: Clean Controllers e Presenters, POJOs que traduzem entre casos de uso e o formato HTTP.
- **`infrastructure/`**: a borda NestJS (controllers finos, guards, DTOs com `@ApiProperty`, filtros), o Prisma, o SNS/SQS, o Valkey, o cliente HTTP e o logging.

A regra é verificada por ferramenta: a cerca do ESLint proíbe `@nestjs/*`, `@generated/*` (Prisma), `@opentelemetry/*`, `@aws-sdk/*`, `sqs-consumer`, `ioredis` e `mercadopago` em `domain/`, `application/` e `interface-adapters/`, e o lint falha na violação. Use cases e Clean Controllers são classes sem `@Injectable`, compostas pelo módulo Nest com `useFactory`.

O esqueleto nasce como cópia do `app/` do Work Order, sem o domínio. A diferença contra o template fica restrita a nomes, fila, configuração e catálogos, conferida no PR com um `diff` dos diretórios do kit.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Camadas tradicionais, sem inversão de dependência | Menos arquivos por funcionalidade, mas a regra de negócio dependeria do Prisma e testar um caso de uso exigiria banco ou mock do ORM | — |
| Transaction Script, com a regra nos casos de uso | Menos classes, mas a invariante do orçamento (itens, total, transições) teria de ser repetida em cada ponto de entrada | — |
| Hexagonal com duas camadas (domínio e adaptadores) | Mais enxuto, mas perde o teste do Clean Controller isolado do NestJS e do caso de uso isolado do formato HTTP | — |
| Gerar o serviço com `nest new` | Esqueleto mínimo, mas o kit inteiro teria de ser reescrito e divergiria dos outros serviços | — |
| Pacote npm com o kit, ou workflows reutilizáveis | Uma fonte só para os quatro serviços, mas exige publicação, versionamento e um repositório a mais para um kit que ainda muda junto com os serviços | O kit estabilizar e as cópias começarem a divergir |

## Consequências

### Positivas

- Regra de negócio testável sem framework nem banco, com mocks tipados das portas.
- Um vazamento de framework, ORM ou SDK para as camadas internas falha o lint, antes do PR.
- A estrutura é a mesma dos outros serviços NestJS da solução, e um ajuste no kit vale para todos.

### Negativas e limites

- Mais arquivos por funcionalidade: uma rota nova toca caso de uso, porta, Clean Controller, Presenter, controller fino e DTOs.
- Tipo puro em `interface-adapters/` e DTO decorado em `infrastructure/http/` precisam ficar em sincronia.
- O kit é copiado, não compartilhado: uma correção no kit precisa ser repetida em cada serviço.

## Referências

- [Arquitetura › Camadas](../architecture.md#camadas)
- [Arquitetura › Cerca de camadas](../architecture.md#cerca-de-camadas)
