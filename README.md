# Missão PC-TO

App de estudos (PWA) para o concurso da **Polícia Civil do Tocantins — Oficial Investigador de Polícia** (banca Cebraspe).

> Este repositório reaproveita o antigo `vera-trecho-v2-`. O conteúdo antigo está preservado no branch
> [`arquivo-vera-trecho-v2`](../../tree/arquivo-vera-trecho-v2). A versão V2 do Vera Trechos continua publicada no
> repositório `vera-trechos` (rota `/v2/`).

## O que já funciona (v0.1)

- **Hoje:** contagem regressiva para o edital e para a prova, horas da semana × meta, sequência de dias e próximos lembretes.
- **Estudar:** sessão rápida de 10 a 15 min (flashcards vencidos + questões do ponto mais fraco) e bloco de 50 + 10 min com cronômetro.
- **Questões:** Simulado Inédito 01, a prova prevista com 80 questões, com gabarito comentado e base legal. Cada erro vira flashcard (D+1, D+7, D+30, D+60).
- **Plano:** meta de 4 a 20 h por semana e fases 1 a 3. Os blocos são distribuídos pelo peso da disciplina e pelo seu acerto.
- **Lembretes inteligentes:** revisão às 07:00, sessões rápidas às 12:30 e 18:30, silêncio das 22:00 às 06:30 (tudo editável).
  - Só avisam quando há algo a fazer.
  - Não tocam se você estudou na última hora ou já bateu a meta do dia.
  - Aprendem o seu horário real de estudo.
  - Têm anticansaço: 3 avisos ignorados seguidos pausam aquele horário por 1 dia.
  - Avisam às 20h para salvar a sequência e lembram os prazos do concurso com 3 dias e 1 dia de antecedência.
  - Exportação de 14 dias para o Calendário do iPhone (.ics, com alarme).
- **Mais:** calendário do concurso, fontes gratuitas, ajustes e backup.
- Funciona offline (service worker). Os dados ficam no aparelho (`localStorage`).

## Como publicar (1 vez, no GitHub)

1. **Settings → General → Repository name:** renomeie para `missao-pcto` (opcional, recomendado).
2. **Settings → Pages:** em *Build and deployment*, escolha *Deploy from a branch*, branch `main` e pasta `/ (root)`, e salve.
3. O app fica em `https://lgrsv.github.io/missao-pcto/` (ou `…/vera-trecho-v2-/`, se não renomear).
4. No iPhone: abra o link no Safari → Compartilhar → **Adicionar à Tela de Início** → abra pelo ícone → **Lembretes → Ativar notificações**.

## Lembretes com o app fechado (próximo passo — Supabase)

No iPhone, notificação de web app só chega com o app fechado se vier pela nuvem (Web Push). A parte de nuvem já está
pronta em `supabase/`, mas **ainda não foi aplicada**. Ela depende da sua autorização e da escolha do projeto:

- `supabase/schema.sql`: schema `estudos` (estado, inscrições de push, log de lembretes) e agendamento a cada 5 min.
- `supabase/functions/lembretes`: usa o **mesmo motor** do app (`_shared/engine.js`) para decidir e enviar.
- `supabase/functions/tutor`: agente de dúvidas. A chave da IA fica só como segredo no Supabase (`IA_PROVEDOR`, `IA_CHAVE`).

## Testes

```bash
npm test   # 17 testes: datas, fuso de Palmas, revisões, pontuação, planejador, lembretes inteligentes, .ics, dados
```

## Documentos

- [Plano do app v2.0 (PDF)](docs/Plano_App_v2.pdf)
- [Simulado Inédito 01 — prova prevista (PDF)](docs/Simulado_01_Prova_Prevista.pdf)
- [Gabarito comentado (PDF)](docs/Simulado_01_Gabarito_Comentado.pdf)

As questões são inéditas, elaboradas com base na legislação vigente em 17/11/2026. Não são questões oficiais.
