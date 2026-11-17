// Missão PC-TO — app (UI). Dados no aparelho (localStorage); sincronização com Supabase entra depois.
import * as E from "./engine.js";

const KEY = "missaopcto.v1";
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hojeISO = () => E.localParts(Date.now()).iso;
const agoraMin = () => E.localParts(Date.now()).min;

let Q = null, PLANO = null, S = null;
let rapida = null, crono = null, quiz = { disc: "", idx: 0, modo: "treino" };

// ------------------------------------------------------------------ estado
function estadoPadrao() {
  return {
    cfg: { horasSemana: E.DEFAULTS.horasSemana, fase: 1, metaAcerto: E.DEFAULTS.metaAcerto,
           lembretes: structuredClone(E.DEFAULTS.lembretes), supabaseUrl: "", supabaseAnon: "" },
    cards: [], respostas: {}, sessoes: [], revisoes: [], historico: {}, disparados: {}, log: [],
    marcosEditados: {}, criado: hojeISO(),
  };
}
function carregar() {
  try { S = { ...estadoPadrao(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { S = estadoPadrao(); }
  S.cfg.lembretes = { ...E.DEFAULTS.lembretes, ...(S.cfg.lembretes || {}) };
  S.cfg.lembretes.ativos = { ...E.DEFAULTS.lembretes.ativos, ...(S.cfg.lembretes.ativos || {}) };
}
function salvar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Não foi possível salvar: " + e.message); } }

function toast(msg, ms = 3500) {
  const t = $("#toast"); t.innerHTML = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------ derivados
function desempenho() {
  const por = {};
  for (const q of Q.questoes) {
    const r = S.respostas[q.n]; if (!r) continue;
    por[q.disc] = por[q.disc] || { c: 0, t: 0 }; por[q.disc].t++; if (r.correta) por[q.disc].c++;
  }
  for (const s of S.sessoes) if (s.disc && s.feitas) {
    por[s.disc] = por[s.disc] || { c: 0, t: 0 }; por[s.disc].t += s.feitas; por[s.disc].c += s.certas || 0;
  }
  const out = {}; for (const [d, v] of Object.entries(por)) out[d] = v.t ? v.c / v.t : null;
  return out;
}
function minutosNoDia(iso) {
  return S.sessoes.filter((s) => E.localParts(s.inicio).iso === iso).reduce((a, s) => a + (s.min || 0), 0);
}
function minutosSemana() {
  const h = hojeISO(); const wd = (E.weekday(h) + 6) % 7; const seg = E.addDays(h, -wd);
  return S.sessoes.filter((s) => { const d = E.localParts(s.inicio).iso; return d >= seg && d <= h; })
    .reduce((a, s) => a + (s.min || 0), 0);
}
function sequencia() {
  let n = 0, d = hojeISO();
  if (!minutosNoDia(d)) d = E.addDays(d, -1);
  while (minutosNoDia(d) > 0) { n++; d = E.addDays(d, -1); }
  return n;
}
function metaDiariaMin() { return Math.round((S.cfg.horasSemana * 60) / 6); }
function marcos() {
  return PLANO.marcos.map((m) => ({ ...m, ...(S.marcosEditados[m.nome] || {}) }));
}
function estadoMotor() {
  return { cfg: S.cfg.lembretes, cards: S.cards, revisoes: S.revisoes, sessoes: S.sessoes, historico: S.historico,
           marcos: marcos(), sequencia: sequencia(), desempenho: desempenho() };
}
function pesosFase() {
  const p = {};
  for (const d of PLANO.disciplinas) if (S.cfg.fase >= 2 || d.prioridade === "A") p[d.nome] = d.peso;
  return p;
}
function registrarSessao(s) {
  S.sessoes.push(s);
  // quem estudou "respondeu" aos lembretes do dia
  for (const id of ["rapida1", "rapida2", "revisao", "sequencia"]) {
    if (S.disparados[hojeISO() + ":" + id]) S.historico = E.registrarResposta(S.historico, id, true, hojeISO());
  }
  salvar();
}

// ------------------------------------------------------------------ lembretes (app aberto)
async function verificarLembretes() {
  const hoje = hojeISO(), min = agoraMin();
  // ontem: lembretes disparados e sem estudo depois contam como ignorados
  const ontem = E.addDays(hoje, -1);
  if (!S._fechouDia || S._fechouDia < ontem) {
    for (const id of ["rapida1", "rapida2"]) {
      if (S.disparados[ontem + ":" + id] && !minutosNoDia(ontem)) S.historico = E.registrarResposta(S.historico, id, false, ontem);
    }
    S._fechouDia = ontem;
  }
  const plano = E.planejarDia(estadoMotor(), hoje);
  for (const r of plano) {
    const chave = hoje + ":" + r.id; const t = E.hhmmToMin(r.hora);
    if (S.disparados[chave] || min < t || min > t + 90) continue;
    const dec = E.deveDisparar(r, { agoraMs: Date.now(), sessoes: S.sessoes, metaDiariaMin: metaDiariaMin() });
    S.disparados[chave] = dec.ok ? "enviado" : "pulado";
    S.log.unshift({ quando: new Date().toISOString(), id: r.id, titulo: r.titulo, ok: dec.ok, motivo: dec.motivo || "" });
    S.log = S.log.slice(0, 60);
    if (dec.ok) await notificar(r);
  }
  salvar();
}
async function notificar(r) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(r.titulo, { body: r.corpo, icon: "icons/icon-192.png", data: { abrir: r.abrir }, tag: r.id }); return; }
      new Notification(r.titulo, { body: r.corpo });
      return;
    }
  } catch { /* cai no aviso interno */ }
  toast(`<b>🔔 ${esc(r.titulo)}</b><br>${esc(r.corpo)} <a href="${r.abrir}">Abrir</a>`, 8000);
}

// ------------------------------------------------------------------ telas
const telas = {
  hoje() {
    const h = hojeISO(); const ms = marcos();
    const edital = ms.find((m) => m.nome.startsWith("Edital")); const prova = ms.find((m) => m.nome.startsWith("Prova"));
    const venc = E.cartoesVencidos(S.cards, h).length;
    const semMin = minutosSemana(), metaMin = S.cfg.horasSemana * 60;
    const plano = E.planejarDia(estadoMotor(), h).filter((r) => E.hhmmToMin(r.hora) >= agoraMin());
    const resp = Object.keys(S.respostas).length;
    const des = desempenho(); const fraca = E.disciplinaMaisFraca(des);
    return `
    <div class="card"><div class="row">
      <div class="kpi"><b>${Math.max(0, E.diffDays(h, edital.data))}</b><small>dias p/ edital (${edital.status})</small></div>
      <div class="kpi"><b>${Math.max(0, E.diffDays(h, prova.data))}</b><small>dias p/ prova (${prova.status})</small></div>
      <div class="kpi"><b>${sequencia()}</b><small>dias seguidos</small></div></div></div>
    <div class="card"><h2>Semana</h2>
      <div class="bar"><i style="width:${Math.min(100, (semMin / metaMin) * 100)}%"></i></div>
      <p class="small mut">${(semMin / 60).toFixed(1).replace(".", ",")} h de ${S.cfg.horasSemana} h · hoje: ${minutosNoDia(h)} min de ${metaDiariaMin()} min</p>
      <a class="btn full" href="#estudar?rapida=1">⚡ Sessão rápida (10 min)</a>
      <p class="small mut">${venc} flashcard(s) vencido(s) · ${resp}/80 questões respondidas${fraca ? ` · ponto fraco: <b>${esc(fraca)}</b>` : ""}</p></div>
    <div class="card"><h2>Próximos lembretes de hoje</h2>
      ${plano.length ? `<ul class="list">${plano.map((r) => `<li><b>${r.hora}</b> · ${esc(r.titulo)}${r.ajustado ? ` <span class="tag ok">ajustado: ${esc(r.motivo)}</span>` : ""}<br><span class="small mut">${esc(r.corpo)}</span></li>`).join("")}</ul>`
        : `<p class="mut small">Nada pendente para hoje. Os lembretes só aparecem quando há algo a fazer.</p>`}</div>`;
  },

  estudar(params) {
    if (params.get("rapida") && !rapida) iniciarRapida();
    if (rapida) return telaRapida();
    const discs = PLANO.disciplinas.map((d) => `<option>${esc(d.nome)}</option>`).join("");
    return `
    <div class="card"><h2>⚡ Sessão rápida</h2><p class="small mut">10 a 15 min: primeiro os flashcards vencidos, depois questões do seu ponto mais fraco.</p>
      <button class="btn full" data-act="rapida">Começar sessão rápida</button></div>
    <div class="card"><h2>⏱️ Bloco de estudo (50 + 10)</h2>
      ${crono ? `<div class="timer" id="tm">--:--</div><p class="center small mut">${esc(crono.disc)} · ${crono.pausa ? "intervalo" : "estudo"}</p>
        <div class="row"><button class="btn sec" data-act="crono-pausar">${crono.parado ? "Continuar" : "Pausar"}</button>
        <button class="btn" data-act="crono-fim">Concluir bloco</button></div>`
      : `<label>Disciplina</label><select id="cdisc">${discs}</select><br><br>
         <button class="btn full" data-act="crono-ini">Iniciar 50 min</button>`}</div>
    <div class="card"><h2>🧠 Flashcards</h2><p class="small mut">${S.cards.length} cartões · ${E.cartoesVencidos(S.cards, hojeISO()).length} vencidos hoje.
      Erros nas questões viram cartões automaticamente (revisão em D+1, D+7, D+30 e D+60).</p></div>`;
  },

  questoes() {
    const discs = [...new Set(Q.questoes.map((q) => q.disc))];
    const lista = Q.questoes.filter((q) => !quiz.disc || q.disc === quiz.disc);
    if (quiz.idx >= lista.length) quiz.idx = 0;
    const q = lista[quiz.idx]; const r = S.respostas[q.n];
    const tot = Object.keys(S.respostas).length, cert = Object.values(S.respostas).filter((x) => x.correta).length;
    return `
    <div class="card"><div class="row">
      <div class="kpi"><b>${cert}/${tot}</b><small>acertos (de 80)</small></div>
      <div class="kpi"><b>${tot ? Math.round((cert / tot) * 100) : 0}%</b><small>aproveitamento</small></div></div>
      <label>Disciplina</label><select id="qdisc"><option value="">Prova completa (80 questões)</option>
      ${discs.map((d) => `<option ${d === quiz.disc ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
    <div class="card">
      <span class="tag">Questão ${String(q.n).padStart(2, "0")}</span><span class="tag">${esc(q.disc)}</span>${q.prev ? `<span class="tag warn">${esc(q.prev)}</span>` : ""}
      ${q.texto ? `<details><summary class="small">Ver Texto I</summary><div class="texto">${esc(Q.texto_I.replace(/<br\/>/g, "\n"))}</div></details>` : ""}
      <p><b>${esc(q.enun)}</b></p>
      ${q.opts.map((o, i) => { const L = "ABCDE"[i]; let c = "";
        if (r) c = L === q.resp ? "ok" : (L === r.marcada ? "bad" : "");
        return `<button class="opt ${c}" data-act="resp" data-n="${q.n}" data-l="${L}" ${r ? "disabled" : ""}><b>${L})</b> ${esc(o)}</button>`; }).join("")}
      ${r ? `<div class="card" style="background:var(--card2)"><b>${r.correta ? "✅ Acertou" : "❌ Errou"} — Resposta: ${q.resp}</b>
        <p>${esc(q.com)}</p><p class="small mut"><b>Base:</b> ${esc(q.base)}</p>
        <p class="small mut">🎧 Mídia curta: em curadoria (entra após aprovação). ${!r.correta ? "· 🧠 Virou flashcard." : ""}</p>
        <div class="row"><button class="btn sec" data-act="card" data-n="${q.n}">Virar flashcard</button>
        <button class="btn sec" data-act="agente" data-n="${q.n}">Perguntar ao agente</button></div>
        <button class="btn sec full" style="margin-top:8px" data-act="refazer" data-n="${q.n}">Refazer esta questão</button></div>` : ""}
      <div class="row" style="margin-top:10px"><button class="btn sec" data-act="qprev">◀ Anterior</button><button class="btn" data-act="qnext">Próxima ▶</button></div>
      <p class="small mut">${quiz.idx + 1} de ${lista.length} · Simulado Inédito 01 (prova prevista). Gabarito e PDF em <a href="docs/Simulado_01_Prova_Prevista.pdf">docs</a>.</p></div>`;
  },

  plano() {
    const des = desempenho();
    const blocos = E.distribuirBlocos(S.cfg.horasSemana, pesosFase(), des, S.cfg.metaAcerto);
    const h = hojeISO(); const wd = (E.weekday(h) + 6) % 7; const seg = E.addDays(h, -wd);
    const sem = E.montarSemana(blocos, seg);
    const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    return `
    <div class="card"><h2>Meta semanal</h2>
      <label>Horas por semana: <b id="hval">${S.cfg.horasSemana} h</b></label>
      <input type="range" id="horas" min="4" max="20" step="1" value="${S.cfg.horasSemana}">
      <label>Fase</label><select id="fase">
        <option value="1" ${S.cfg.fase == 1 ? "selected" : ""}>1 · Base (agora → edital): só disciplinas A</option>
        <option value="2" ${S.cfg.fase == 2 ? "selected" : ""}>2 · Edital: todas, pelos pesos</option>
        <option value="3" ${S.cfg.fase == 3 ? "selected" : ""}>3 · Reta final</option></select>
      <p class="small mut">O ciclo é recalculado na hora. Disciplina com acerto abaixo da meta (${Math.round(S.cfg.metaAcerto * 100)}%) ganha mais blocos.</p></div>
    <div class="card"><h2>Blocos da semana (${S.cfg.horasSemana} h)</h2><ul class="list">
      ${Object.entries(blocos).sort((a, b) => b[1] - a[1]).map(([d, n]) => `<li>${esc(d)} <b style="float:right">${n}</b>
        ${des[d] != null ? `<br><span class="small mut">acerto atual: ${Math.round(des[d] * 100)}%</span>` : ""}</li>`).join("")}</ul></div>
    <div class="card"><h2>Distribuição nos dias</h2><ul class="list">
      ${sem.map((d) => `<li><b>${nomes[E.weekday(d.data)]} ${d.data.slice(8)}/${d.data.slice(5, 7)}</b> · ${d.blocos.map(esc).join(" → ") || "—"}</li>`).join("")}</ul></div>`;
  },

  lembretes() {
    const c = S.cfg.lembretes; const h = hojeISO();
    const hojeP = E.planejarDia(estadoMotor(), h), amanhaP = E.planejarDia(estadoMotor(), E.addDays(h, 1));
    const perm = "Notification" in window ? Notification.permission : "indisponível";
    const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const item = (r) => `<li><b>${r.hora}</b> · ${esc(r.titulo)} ${r.ajustado ? `<span class="tag ok">${esc(r.motivo)}</span>` : ""}<br><span class="small mut">${esc(r.corpo)}</span></li>`;
    const tg = (id, nome) => `<label style="display:flex;gap:8px;align-items:center;color:var(--txt)"><input type="checkbox" style="width:auto" data-tg="${id}" ${c.ativos[id] ? "checked" : ""}> ${nome}</label>`;
    return `
    <div class="card"><h2>🔔 Lembretes inteligentes</h2>
      <div class="row"><div><label>Revisão</label><input type="time" data-h="revisao" value="${c.revisao}"></div>
      <div><label>Sessão rápida 1</label><input type="time" data-h="rapida1" value="${c.rapida1}"></div>
      <div><label>Sessão rápida 2</label><input type="time" data-h="rapida2" value="${c.rapida2}"></div></div>
      <div class="row"><div><label>Silêncio de</label><input type="time" data-h="silencioIni" value="${c.silencioIni}"></div>
      <div><label>até</label><input type="time" data-h="silencioFim" value="${c.silencioFim}"></div>
      <div><label>Máx. por dia</label><input type="number" min="1" max="8" data-h="maxDia" value="${c.maxDia}"></div></div>
      ${tg("revisao", "Revisão da manhã")}${tg("rapida1", "Sessão rápida 1")}${tg("rapida2", "Sessão rápida 2")}${tg("sequencia", "Salvar sequência (20h)")}${tg("prazos", "Prazos do concurso (D-3 e D-1)")}
      <h3>O que os deixa inteligentes</h3><ul class="small mut">
        <li>Só avisam quando há algo a fazer (cartões vencidos, revisões, meta do dia aberta).</li>
        <li>Não tocam se você já estudou na última hora ou já bateu a meta do dia.</li>
        <li>Aprendem seu horário: se você estuda sempre em outro horário, o aviso se ajusta sozinho.</li>
        <li>Anticansaço: 3 avisos ignorados seguidos pausam aquele horário por 1 dia.</li>
        <li>Às 20h, se não houve estudo, avisam para salvar a sequência.</li>
        <li>Respeitam o silêncio e o limite diário, e avisam prazos do concurso com 3 dias e 1 dia de antecedência.</li></ul></div>
    <div class="card"><h2>Hoje</h2>${hojeP.length ? `<ul class="list">${hojeP.map(item).join("")}</ul>` : `<p class="mut small">Nenhum lembrete necessário hoje.</p>`}
      <h3>Amanhã (previsão)</h3>${amanhaP.length ? `<ul class="list">${amanhaP.map(item).join("")}</ul>` : `<p class="mut small">Nenhum por enquanto.</p>`}</div>
    <div class="card"><h2>Como receber no iPhone</h2>
      <p class="small">Notificações: <b>${perm}</b> · App instalado na tela de início: <b>${instalado ? "sim" : "não"}</b></p>
      <ol class="small mut"><li>No Safari, toque em Compartilhar → <b>Adicionar à Tela de Início</b> e abra o app por lá.</li>
        <li>Toque em <b>Ativar notificações</b>.</li>
        <li>Com o app aberto, os avisos já funcionam. Para chegarem com o app <b>fechado</b>, falta ligar o envio pela nuvem (Supabase), que depende da sua autorização.</li>
        <li>Enquanto isso, use <b>Exportar para o Calendário</b>: os próximos 14 dias de lembretes entram no Calendário do iPhone com alarme.</li></ol>
      <div class="row"><button class="btn" data-act="perm">Ativar notificações</button><button class="btn sec" data-act="teste">Testar aviso</button></div><br>
      <button class="btn sec full" data-act="ics">📅 Exportar 14 dias para o Calendário (.ics)</button></div>
    <div class="card"><h2>Registro</h2>${S.log.length ? `<ul class="list small">${S.log.slice(0, 12).map((l) => `<li>${new Date(l.quando).toLocaleString("pt-BR")} · ${esc(l.titulo)} · ${l.ok ? "enviado" : "pulado: " + esc(l.motivo)}</li>`).join("")}</ul>` : `<p class="mut small">Ainda sem registros.</p>`}</div>`;
  },

  mais() {
    const ms = marcos(); const h = hojeISO();
    return `
    <div class="card"><h2>📅 Calendário do concurso</h2><ul class="list">
      ${ms.map((m) => `<li><b>${esc(m.nome)}</b> <span class="tag ${m.status === "confirmado" ? "ok" : m.status === "previsto" ? "warn" : ""}">${m.status}</span><br>
        <span class="small mut">${m.data.split("-").reverse().join("/")} · ${E.diffDays(h, m.data) >= 0 ? "faltam " + E.diffDays(h, m.data) + " dias" : "passou"} · ${esc(m.fonte || "")}</span>
        ${m.status !== "confirmado" ? `<br><input type="date" data-marco="${esc(m.nome)}" value="${m.data}" style="margin-top:6px">` : ""}</li>`).join("")}</ul>
      <p class="small mut">Quando o edital sair, as datas oficiais entram aqui e o plano se reorganiza. O aviso automático diário roda às 8h44.</p></div>
    <div class="card"><h2>📚 Fontes gratuitas</h2><ul class="list">${PLANO.fontes.map((f) => `<li><span class="small mut">${esc(f.para)}</span><br><a href="${f.url}" target="_blank" rel="noopener">${esc(f.nome)}</a></li>`).join("")}
      <li><a href="docs/Plano_App_v2.pdf">Plano do app (PDF)</a> · <a href="docs/Simulado_01_Prova_Prevista.pdf">Prova prevista</a> · <a href="docs/Simulado_01_Gabarito_Comentado.pdf">Gabarito</a></li></ul></div>
    <div class="card"><h2>⚙️ Ajustes</h2>
      <label>Meta de acerto</label><select id="meta">${[0.6, 0.7, 0.8].map((v) => `<option value="${v}" ${S.cfg.metaAcerto == v ? "selected" : ""}>${v * 100}%</option>`).join("")}</select>
      <label>Supabase (para lembretes com o app fechado, sincronização e agente)</label>
      <input id="sburl" placeholder="URL do projeto (https://xxxx.supabase.co)" value="${esc(S.cfg.supabaseUrl)}"><br><br>
      <input id="sbkey" placeholder="Chave pública (anon)" value="${esc(S.cfg.supabaseAnon)}">
      <p class="small mut">A chave da IA do agente nunca fica no app: ela é guardada como segredo no Supabase.</p>
      <div class="row"><button class="btn sec" data-act="exportar">Exportar backup</button>
      <label class="btn sec" style="margin:0">Importar backup<input type="file" id="imp" accept="application/json" hidden></label></div></div>`;
  },
};

// ------------------------------------------------------------------ sessão rápida
function iniciarRapida() {
  const h = hojeISO();
  const cards = E.cartoesVencidos(S.cards, h).slice(0, 20).map((c) => ({ tipo: "card", c }));
  let itens = cards;
  if (itens.length < 10) {
    const fraca = E.disciplinaMaisFraca(desempenho());
    const pool = Q.questoes.filter((q) => !S.respostas[q.n] && (!fraca || q.disc === fraca));
    const resto = (pool.length ? pool : Q.questoes.filter((q) => !S.respostas[q.n])).slice(0, 10 - itens.length);
    itens = itens.concat(resto.map((q) => ({ tipo: "q", q })));
  }
  rapida = { itens, i: 0, inicio: Date.now(), virado: false, feitas: 0, certas: 0 };
}
function telaRapida() {
  const it = rapida.itens[rapida.i];
  if (!it) return `<div class="card"><h2>Sessão concluída ✅</h2><p>${rapida.feitas} itens · ${rapida.certas} certos.</p>
    <button class="btn full" data-act="rapida-fim">Registrar e voltar</button></div>`;
  const prog = `<p class="small mut">Item ${rapida.i + 1} de ${rapida.itens.length} · ${Math.round((Date.now() - rapida.inicio) / 60000)} min</p>`;
  if (it.tipo === "card") return `<div class="card"><h2>🧠 Flashcard</h2>${prog}
    <div class="flash">${esc(rapida.virado ? it.c.verso : it.c.frente)}</div><br>
    ${rapida.virado ? `<div class="row"><button class="btn sec" data-act="card-errei">Errei</button><button class="btn" data-act="card-acertei">Acertei</button></div>`
      : `<button class="btn full" data-act="virar">Mostrar resposta</button>`}
    <br><button class="btn sec full" data-act="rapida-fim">Encerrar sessão</button></div>`;
  const q = it.q;
  return `<div class="card"><h2>📝 Questão ${q.n}</h2>${prog}<span class="tag">${esc(q.disc)}</span><p><b>${esc(q.enun)}</b></p>
    ${q.opts.map((o, i) => `<button class="opt" data-act="rq" data-l="${"ABCDE"[i]}"><b>${"ABCDE"[i]})</b> ${esc(o)}</button>`).join("")}
    <button class="btn sec full" data-act="rapida-fim">Encerrar sessão</button></div>`;
}
function fimRapida() {
  const min = Math.max(1, Math.round((Date.now() - rapida.inicio) / 60000));
  if (rapida.feitas) registrarSessao({ inicio: rapida.inicio, fim: Date.now(), min, tipo: "rapida", feitas: 0, certas: 0 });
  toast(`Sessão registrada: ${min} min.`); rapida = null; location.hash = "#hoje";
}

// ------------------------------------------------------------------ respostas e cartões
function responder(n, L) {
  const q = Q.questoes.find((x) => x.n == n); const correta = L === q.resp;
  S.respostas[n] = { marcada: L, correta, data: hojeISO() };
  if (!correta) criarCartao(q, false);
  salvar(); return correta;
}
function criarCartao(q, avisar = true) {
  const id = "q" + q.n;
  if (S.cards.find((c) => c.id === id)) { if (avisar) toast("Esse flashcard já existe."); return; }
  const verso = `${q.opts["ABCDE".indexOf(q.resp)]}\n\n${q.base}`;
  S.cards.push(E.novoCartao(id, `${q.disc}: ${q.enun}`, verso, hojeISO(), "erro"));
  salvar(); if (avisar) toast("Flashcard criado: revisão amanhã.");
}

// ------------------------------------------------------------------ eventos
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "rapida") { iniciarRapida(); render(); }
  else if (a === "virar") { rapida.virado = true; render(); }
  else if (a === "card-acertei" || a === "card-errei") {
    const it = rapida.itens[rapida.i]; const ok = a === "card-acertei";
    const idx = S.cards.findIndex((c) => c.id === it.c.id);
    if (idx >= 0) S.cards[idx] = E.revisarCartao(S.cards[idx], ok, hojeISO());
    rapida.feitas++; if (ok) rapida.certas++; rapida.i++; rapida.virado = false; salvar(); render();
  }
  else if (a === "rq") {
    const it = rapida.itens[rapida.i]; const ok = responder(it.q.n, b.dataset.l);
    rapida.feitas++; if (ok) rapida.certas++;
    toast(ok ? "✅ Certo!" : `❌ Resposta: ${it.q.resp}. ${esc(it.q.com)}`, ok ? 1500 : 7000);
    rapida.i++; render();
  }
  else if (a === "rapida-fim") fimRapida();
  else if (a === "resp") { responder(b.dataset.n, b.dataset.l); render(); }
  else if (a === "refazer") { delete S.respostas[b.dataset.n]; salvar(); render(); }
  else if (a === "card") criarCartao(Q.questoes.find((x) => x.n == b.dataset.n));
  else if (a === "agente") toast(S.cfg.supabaseUrl ? "Agente: aguardando a chave da IA no Supabase." : "Agente ainda não ligado: falta configurar o Supabase e a chave da IA.", 5000);
  else if (a === "qnext") { quiz.idx++; render(); }
  else if (a === "qprev") { quiz.idx = Math.max(0, quiz.idx - 1); render(); }
  else if (a === "crono-ini") { crono = { disc: $("#cdisc").value, inicio: Date.now(), acumulado: 0, desde: Date.now(), parado: false }; render(); }
  else if (a === "crono-pausar") {
    if (crono.parado) { crono.desde = Date.now(); crono.parado = false; }
    else { crono.acumulado += Date.now() - crono.desde; crono.parado = true; }
    render();
  }
  else if (a === "crono-fim") {
    const ms = crono.acumulado + (crono.parado ? 0 : Date.now() - crono.desde); const min = Math.max(1, Math.round(ms / 60000));
    registrarSessao({ inicio: crono.inicio, fim: Date.now(), min, tipo: "bloco", disc: crono.disc });
    toast(`Bloco registrado: ${min} min de ${esc(crono.disc)}.`); crono = null; render();
  }
  else if (a === "perm") {
    if (!("Notification" in window)) return toast("Este navegador não suporta notificações. No iPhone, instale o app na tela de início.", 6000);
    const p = await Notification.requestPermission(); toast("Permissão: " + p); render();
  }
  else if (a === "teste") notificar({ id: "teste", titulo: "Teste da Missão PC-TO", corpo: "Se você viu isto, os avisos estão funcionando.", abrir: "#hoje" });
  else if (a === "ics") {
    const h = hojeISO(); const dias = [];
    for (let i = 0; i < 14; i++) { const d = E.addDays(h, i); dias.push({ data: d, lembretes: E.planejarDia(estadoMotor(), d).filter((r) => r.tipo !== "sequencia") }); }
    baixar("missao-pcto-lembretes.ics", E.gerarICS(dias), "text/calendar");
    toast("Arquivo .ics gerado. Abra no iPhone e toque em “Adicionar todos”.", 6000);
  }
  else if (a === "exportar") baixar(`missao-pcto-backup-${hojeISO()}.json`, JSON.stringify(S), "application/json");
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "qdisc") { quiz.disc = t.value; quiz.idx = 0; render(); }
  else if (t.id === "horas") { S.cfg.horasSemana = +t.value; salvar(); render(); }
  else if (t.id === "fase") { S.cfg.fase = +t.value; salvar(); render(); }
  else if (t.id === "meta") { S.cfg.metaAcerto = +t.value; salvar(); }
  else if (t.id === "sburl" || t.id === "sbkey") { S.cfg[t.id === "sburl" ? "supabaseUrl" : "supabaseAnon"] = t.value.trim(); salvar(); toast("Salvo."); }
  else if (t.dataset.h) { S.cfg.lembretes[t.dataset.h] = t.dataset.h === "maxDia" ? +t.value : t.value; salvar(); render(); }
  else if (t.dataset.tg) { S.cfg.lembretes.ativos[t.dataset.tg] = t.checked; salvar(); render(); }
  else if (t.dataset.marco) { S.marcosEditados[t.dataset.marco] = { data: t.value }; salvar(); render(); }
  else if (t.id === "imp" && t.files[0]) {
    t.files[0].text().then((txt) => { S = { ...estadoPadrao(), ...JSON.parse(txt) }; salvar(); toast("Backup importado."); render(); })
      .catch(() => toast("Arquivo inválido."));
  }
});
document.addEventListener("input", (ev) => { if (ev.target.id === "horas") $("#hval").textContent = ev.target.value + " h"; });

function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ------------------------------------------------------------------ roteamento
function render() {
  const [rota, qs] = (location.hash.slice(1) || "hoje").split("?");
  const tela = telas[rota] ? rota : "hoje";
  $("#view").innerHTML = telas[tela](new URLSearchParams(qs || ""));
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + tela));
  if (crono && tela === "estudar") tick();
}
function tick() {
  const el = $("#tm"); if (!el || !crono) return;
  const ms = crono.acumulado + (crono.parado ? 0 : Date.now() - crono.desde);
  const rest = Math.max(0, 50 * 60000 - ms);
  el.textContent = `${String(Math.floor(rest / 60000)).padStart(2, "0")}:${String(Math.floor((rest % 60000) / 1000)).padStart(2, "0")}`;
  if (rest === 0 && !crono.avisado) { crono.avisado = true; notificar({ id: "bloco", titulo: "Bloco concluído", corpo: "Hora do intervalo de 10 min.", abrir: "#estudar" }); }
}
window.addEventListener("hashchange", render);
setInterval(() => { tick(); }, 1000);
setInterval(() => { verificarLembretes(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { verificarLembretes(); render(); } });

// ------------------------------------------------------------------ início
(async function init() {
  carregar();
  [Q, PLANO] = await Promise.all([fetch("data/questoes.json").then((r) => r.json()), fetch("data/plano.json").then((r) => r.json())]);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  render(); verificarLembretes();
})().catch((e) => { $("#view").innerHTML = `<div class="card">Erro ao carregar: ${esc(e.message)}</div>`; });
