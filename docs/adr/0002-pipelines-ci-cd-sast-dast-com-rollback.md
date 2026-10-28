# ADR 0002: Pipelines de CI, CD, SAST e DAST, com rollback e DAST com JWT de teste

## Status

Aceito — 2026-10-27

## Contexto

Cada serviço da solução tem o próprio repositório, a própria imagem e o próprio deploy no EKS. Validar uma mudança, entregá-la, analisá-la estaticamente e testá-la contra a API em execução têm gatilhos, durações e poder de bloqueio diferentes. A `main` é protegida: só recebe merge por PR, com checks verdes.

O deploy pode falhar depois de a imagem nova estar no cluster: rollout que não termina ou smoke que falha pelo gateway. O ambiente precisa voltar sozinho à versão anterior.

O DAST precisa de um token para exercitar as rotas protegidas. O Billing não tem login: só valida o token de funcionário emitido pelo Identity.

## Decisão

**Quatro workflows do GitHub Actions, um por responsabilidade.**

| Workflow | Gatilho | Responsabilidade |
|---|---|---|
| CI (`ci.yml`) | `push` em `feature/**` e `fix/**` | `Lint`, `Unit Tests`, `E2E Tests`, `Build` (com o smoke do preload de telemetria) e `DB Validation` em paralelo; com todos verdes, `Open Pull Request` abre o PR pelo GitHub App do bot |
| CD (`cd.yml`) | `push` em `main` e `workflow_dispatch` | Build e push da imagem com a tag do SHA, credenciais e ConfigMap, Job de migração, deploy com `rollout status` e smoke em `/health/billing` pelo gateway |
| SAST (`sast.yml`) | `pull_request` para `main` e `push` em `main` | SonarQube Cloud com o `lcov` unitário e espera do quality gate |
| DAST (`dast.yml`) | `pull_request` para `main` e `workflow_dispatch` | OWASP ZAP contra o OpenAPI da API no stack do compose |

**Rollback automático no CD.** Se o `rollout status` ou o smoke falham, o job roda `kubectl rollout undo` e termina vermelho. O `workflow_dispatch` aceita `image_tag`: reimplanta uma imagem já publicada no ECR, sem build e sem migração, como rollback manual.

**DAST com JWT de teste.** O `dast.yml` gera um par RS256 efêmero no job, sobe o stack com a chave pública desse par, assina um access token de `ADMIN` com o mesmo perfil do token do Identity (`kid`, `iss`, `aud`, `typ`, `exp`) e apaga a chave privada logo depois. O ZAP envia o token em toda requisição. O scan é bloqueante: um alerta fora das regras de `.zap/rules.tsv` falha o job, e o relatório sai como artifact.

**Ruleset da `main`** com os checks `Lint`, `Unit Tests`, `E2E Tests`, `Build`, `SAST` e `OWASP ZAP API Scan`, sem bypass. O `DB Validation` roda no CI sem ser obrigatório.

## Alternativas consideradas

| Alternativa | Trade-off | Rever se |
| --- | --- | --- |
| Um workflow para tudo | Um arquivo só, mas mistura gatilhos incompatíveis e faz o scan lento atrasar o retorno rápido de lint e testes | — |
| CD disparado por `workflow_run` do CI | Encadeamento explícito, mas acopla dois workflows por evento; a `main` protegida já garante que todo push passou pelo CI | — |
| Deploy sem rollback automático | Menos passos no CD, mas uma imagem quebrada fica no ar até alguém agir | — |
| Token do DAST obtido do Identity | Token real, mas o DAST do Billing passaria a depender do Identity no ar e de um usuário semeado lá | O Identity ganhar um stack de teste próprio no CI |
| Chave privada de teste versionada ou em secret | Token reprodutível, mas uma chave que assina tokens aceitos pelo serviço ficaria guardada fora do job | — |
| Cobertura unitária e E2E no Sonar | Mais linhas analisadas, mas o E2E não alcança alguns ramos por HTTP e baixaria a cobertura; os 100% unitários já superam o mínimo | — |
| DAST só no Work Order | Um scan a menos por PR, mas cada serviço tem a própria superfície HTTP | — |

## Consequências

### Positivas

- O retorno rápido do CI não espera os scans.
- Uma entrega que falha no rollout ou no smoke volta sozinha à versão anterior.
- O DAST roda em todo PR sem depender de outro serviço e sem chave guardada.

### Negativas e limites

- Quatro arquivos de workflow: uma variável usada em mais de um precisa ser repetida.
- O `rollout undo` volta a imagem, não o banco: uma migração incompatível com a versão anterior não é desfeita. O rollback manual por `image_tag` pula a migração.
- O token do DAST é de teste: um problema que dependa do Identity real não aparece no scan.

## Referências

- [CI/CD](../ci-cd.md)
- [GitHub Actions — rulesets](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [OWASP ZAP — API scan](https://www.zaproxy.org/docs/docker/api-scan/)
