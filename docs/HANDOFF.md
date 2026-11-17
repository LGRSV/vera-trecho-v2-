# Missão PC-TO — handoff do projeto (17/11/2026, 20h)

App de estudos (PWA) do Lagares para o concurso da **Polícia Civil do Tocantins, cargo Oficial Investigador de Polícia** (banca Cebraspe). Este documento reúne tudo o que foi feito e o que falta para o app ficar viável, para uma sessão com acesso total continuar.

## 1. Onde está tudo

- **Repositório:** https://github.com/LGRSV/vera-trecho-v2- (branch `main`, commit `4c6bd98`).
  - Este repositório inativo foi reaproveitado porque a sessão anterior não conseguiu criar um repositório novo.
  - O conteúdo antigo está preservado no branch `arquivo-vera-trecho-v2`. O Vera Trechos V2 continua publicado em `vera-trechos/v2/`.
  - **Renomear para `missao-pcto`** (pendente, ver seção 4).
- **Documentos (PDF) em `docs/` no repositório:**
  - `Plano_App_v2.pdf`: plano completo de criação do app.
  - `Simulado_01_Prova_Prevista.pdf`: prova prevista com 80 questões + redação.
  - `Simulado_01_Gabarito_Comentado.pdf`: gabarito comentado.
- **Aviso diário do edital (já ativo):** tarefa agendada "Radar edital PC-TO" (`trig_01AkQyy3BHUX286pfd7kgHbZ`), todo dia às 08:44 (America/Araguaina), com notificação push só quando há novidade.

## 2. O que o app já faz (v0.1, testado)

- Stack: HTML, CSS e JS puros, PWA offline (`sw.js`), dados no `localStorage` (chave `missaopcto.v1`). Sem build.
- `js/engine.js`: motor puro (datas no fuso de Palmas UTC−3, flashcards D+1/7/30/60, pontuação ME e CE, nota de redação, planejador, lembretes inteligentes, .ics). É usado pelo app e copiado em `supabase/functions/_shared/engine.js` (um teste garante que são idênticos).
- `js/app.js`: telas Hoje, Estudar (sessão rápida + cronômetro 50/10), Questões (80 questões com gabarito e flashcard automático no erro), Plano (4 a 20 h por semana, fases 1 a 3), Lembretes e Mais (calendário, fontes, ajustes e backup).
- **Lembretes inteligentes (horários confirmados pelo Lagares):**
  - Horários: revisão às 07:00, sessões rápidas às 12:30 e 18:30, silêncio das 22:00 às 06:30, no máximo 4 por dia.
  - Só avisam se há algo a fazer.
  - Pulam o aviso se ele estudou na última hora ou já bateu a meta do dia.
  - Aprendem o horário real de estudo.
  - Anticansaço: 3 avisos ignorados seguidos pausam o horário por 1 dia.
  - Às 20h, avisam para salvar a sequência.
  - Avisam prazos do concurso com 3 dias e 1 dia de antecedência.
  - Exportam .ics de 14 dias com alarme.
- **Testes:** `npm test` roda 17 testes, todos passando. Smoke test no Chrome headless (Playwright): questões, flashcard, plano de 20 h, sessão rápida e .ics (41 eventos com alarme), sem erros no console.
- **Limitação atual:** com o app fechado, o iPhone só recebe aviso via Web Push pela nuvem (Supabase), que ainda não foi ligado.

## 3. Decisões já confirmadas pelo Lagares

1. App separado (repositório próprio), com dados na nuvem pelo Supabase.
2. Horas por semana variáveis. Sessões rápidas com flashcards e mídia curta (Spotify/YouTube, até 15 min) no gabarito.
3. Agente de dúvidas na nuvem. A chave da IA ele cria depois e fica como segredo no Supabase.
4. Lembretes são a prioridade, nos horários acima.
5. Fontes gratuitas confiáveis e questões inéditas com previsão de temas.
6. Aviso do edital + calendário que se atualiza.
7. Nome: Missão PC-TO.

## 4. O que ficou bloqueado nesta sessão (precisa de acesso total)

1. **Renomear o repositório** para `missao-pcto`: Settings → General (a API de settings foi bloqueada pelo proxy).
2. **Ativar o GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / `(root)`. Hoje `has_pages = false`. URL final: `https://lgrsv.github.io/missao-pcto/`.
3. **Criação de repositório novo:** foi bloqueada. Se preferirem um repositório novo `missao-pcto`, basta copiar o conteúdo de `main`.

## 5. Próximos passos para o app ficar viável (em ordem)

1. Renomear o repositório e ativar o Pages (seção 4). Abrir a URL e conferir no iPhone: Adicionar à Tela de Início → Lembretes → Ativar notificações → Testar aviso.
2. **Supabase (pendente de resposta do Lagares):** usar o mesmo projeto da agenda/Jarvis, com schema `estudos` (recomendado), ou criar um projeto novo.
   - O projeto da agenda é `uabpevnjfcwidbjscowq`. **Nesse projeto, escrever só com aprovação explícita do Lagares.**
   - Aplicar `supabase/schema.sql`: tabelas `estado`, `push_inscricao`, `lembrete_log`, com RLS.
   - Habilitar `pg_cron` e `pg_net` e guardar `project_url` e `service_role_key` no Vault.
   - Gerar as chaves VAPID (`npx web-push generate-vapid-keys`) e criar os segredos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`.
   - Fazer deploy de `supabase/functions/lembretes` e agendar o cron a cada 5 min (bloco comentado no fim de `schema.sql`).
3. **No app (código a escrever):**
   - Login por link mágico (supabase-js).
   - Enviar o estado para `estudos.estado` a cada mudança (o app guarda tudo em `S`).
   - `PushManager.subscribe` com a VAPID pública e gravação em `push_inscricao`.
   - Ligar o botão “Perguntar ao agente” à função `tutor`.
4. **Agente:** fazer deploy de `supabase/functions/tutor` com os segredos `IA_PROVEDOR` (`gemini` ou `anthropic`), `IA_CHAVE` e `IA_MODELO`. O provedor está pendente de resposta do Lagares; ele já usa Gemini 2.5 Flash Lite no Jarvis.
5. **Integração com a agenda/Jarvis** (repositório `LGRSV/agenda-iphone`): a agenda lê as sessões de estudo no Supabase. Adicionar ao JSON schema do Jarvis as intenções estudo.hoje, estudo.iniciar, estudo.registrar, estudo.desempenho, estudo.adiar, prova.contagem, taf.registrar e briefing.dia.
6. **Curadoria de mídia curta** por tema: fonte oficial primeiro, até 15 min, publicada depois da última mudança da lei, com aprovação do Lagares.
7. **Quando o edital sair:** trocar o modelo previsto pelo edital oficial (disciplinas, pesos, formato, TAF) e atualizar o calendário.

## 6. Cuidados

- GitHub Pages tem cache agressivo: forçar rebuild depois de cada push. Atualizar também o `CACHE` do `sw.js` quando mudar arquivos.
- O token clássico do GitHub do Lagares estava expirado (anotação de 12/10).
- Questões inéditas: manter base legal e data de verificação. Leis novas de 2026 que caem na prova: 15.358 (Antifacção), 15.397 (crimes patrimoniais), 15.380 e 15.438 (Maria da Penha). A PEC 18/2025 foi aprovada no Senado em 03/11/2026 e aguarda promulgação.
- Respostas e textos para o Lagares em português do Brasil. Documentos para ele em PDF; planilhas em XLSX.

## 7. Prompt para colar na sessão que vai continuar

> Leia `docs/HANDOFF.md` do repositório LGRSV/vera-trecho-v2- (ou este documento no projeto "Pessoal João Antonio"). Sua tarefa é deixar o app Missão PC-TO viável no iPhone do Lagares:
> 1. Renomeie o repositório para `missao-pcto` e ative o GitHub Pages (`main`, raiz).
> 2. Confirme com o Lagares qual projeto Supabase usar e qual IA, e só então aplique `supabase/schema.sql`, configure as chaves VAPID e faça deploy de `lembretes` (cron a cada 5 min) e de `tutor`.
> 3. Implemente no app o login, a sincronização do estado, a inscrição de push e a chamada ao agente.
> 4. Rode `npm test` e teste no iPhone: notificação chegando com o app fechado.
>
> Não escreva no projeto Supabase da agenda sem aprovação explícita.
