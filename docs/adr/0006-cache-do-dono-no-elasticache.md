# ADR 0006: Cache do dono no ElastiCache

## Status

Aceito — 2026-10-27

## Contexto

Os orçamentos e os pagamentos do Billing vão ser lidos pelas telas da oficina e por outros serviços, pelas rotas `/internal`. Cada serviço é o único cliente do próprio banco e do próprio cache, e um dado só fica certo em cache se quem o guarda souber quando ele muda: só o dono da entidade sabe.

O cache não pode virar dependência dura: com ele fora do ar, a API precisa continuar respondendo pelo banco, e a réplica continuar pronta.

## Decisão

**Cache-aside no ElastiCache for Valkey do próprio Billing, só para os dados de que ele é dono, com invalidação no caso de uso depois do commit.**

1. **Porta e adaptador.** A porta `ICache` (`get`, `set` com TTL, `delete(keys[])`) fica em `application/ports/output/`; o `ValkeyCacheAdapter` usa `ioredis` por `CACHE_URL` (`rediss://` com senha no cluster, `redis://` local).
2. **Chave com o prefixo do dono** (`billing:<entidade>:<id>`) e TTL de 12 h (`CACHE_TTL_SECONDS`). O valor guardado é versionado: valor ilegível ou de outra versão conta como falta.
3. **A invalidação é do caso de uso, depois do commit**, com o resultado devolvido do callback da transação, como os eventos de negócio.
4. **Falha do cache vira leitura no banco.** O cliente roda sem fila offline, com uma tentativa e `commandTimeout` de 500 ms. Falha de leitura registra `cache.unavailable` e conta como falta; falha de exclusão registra `cache.invalidation_failed` e a chave expira pelo TTL. A prontidão não verifica o cache.

O serviço sobe com a porta e o adaptador prontos e sem nenhum valor em cache: o primeiro caso de uso de leitura decide o que guardar.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Valkey em pod no cluster | Sem custo a mais, mas fica dentro do cluster, sem gestão e fora do diagrama da AWS | — |
| DynamoDB | Gerenciado, mas sem TTL exato nem contador atômico para outros usos do cache | — |
| ElastiCache Serverless | Sem dimensionamento, mas indisponível no ambiente da AWS usado pela solução | O ambiente liberar o serviço |
| Cache em quem consome (30 a 60 s) | Poupa a chamada interna, mas quem consome não sabe quando o dado muda | — |
| TTL de 10 min ou de 24 h | 10 min derruba a taxa de acerto; 24 h não ganha nada sobre 12 h, que já cobre uma sessão de uso | — |
| Invalidação centralizada nos repositórios ou no Unit of Work | Ninguém esquece de invalidar, mas a regra sai do caso de uso para cobrir um esquecimento que o code review já pega | A carga crescer e escritas sem invalidação aparecerem |
| Segundo `DEL` atrasado, ou `SET` condicionado por versão | Fecha a corrida entre leitura que regrava valor velho e escrita que apaga, a um custo desprezível nesta carga | A carga crescer |
| Senha do cache sem TLS, só com security group | Menos configuração, mas o tráfego e o acesso ficariam protegidos só pela rede | — |
| `@nestjs/cache-manager` | Integração pronta, mas o `@keyv/redis` não tem prazo por comando e não distingue falha de leitura de falha de invalidação; a porta continuaria necessária | For preciso um cache em memória sem invalidação entre réplicas |

## Consequências

### Positivas

- O dado em cache só muda por quem o escreve: não há invalidação entre serviços.
- Um Valkey fora do ar ou lento não derruba nem trava a API.
- Um deploy que muda o formato do valor não responde 500: o valor antigo vira falta.

### Negativas e limites

- Toda escrita nova precisa apagar as chaves afetadas; o esquecimento serve dado velho por até 12 h.
- A corrida entre leitura que regrava valor velho e escrita que apaga continua possível, com janela de milissegundos.
- O ElastiCache é mais um recurso pago e provisionado por serviço.

## Referências

- [Arquitetura › Cache e chamadas internas](../architecture.md#cache-e-chamadas-internas)
- [Valkey](https://valkey.io/)
- [AWS — Amazon ElastiCache for Valkey](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html)
- [ioredis](https://github.com/redis/ioredis)
- [Cache-aside](https://learn.microsoft.com/azure/architecture/patterns/cache-aside)
