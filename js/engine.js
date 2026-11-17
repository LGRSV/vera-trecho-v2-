// Missão PC-TO — motor (lógica pura, sem DOM). Usado pelo app, pelos testes e pela função do Supabase.
// Fuso de referência: Palmas/TO (America/Araguaina, UTC−3, sem horário de verão).

export const TZ_OFFSET_MIN = -180; // UTC−3

export const DEFAULTS = {
  horasSemana: 12,
  diasEstudo: [1, 2, 3, 4, 5, 6], // seg..sáb (0 = domingo)
  metaAcerto: 0.7,
  lembretes: {
    revisao: "07:00",
    rapida1: "12:30",
    rapida2: "18:30",
    silencioIni: "22:00",
    silencioFim: "06:30",
    salvarSequencia: "20:00",
    prazos: "09:00",
    maxDia: 4,
    ativos: { revisao: true, rapida1: true, rapida2: true, sequencia: true, prazos: true },
  },
};

// ------------------------------------------------------------------ datas (YYYY-MM-DD, sem fuso)
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
export function diffDays(a, b) { // b − a, em dias
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function hhmmToMin(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
export function minToHHMM(t) {
  t = ((Math.round(t) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
// Converte instante (ms UTC) para data/minuto local de Palmas.
export function localParts(ms) {
  const d = new Date(ms + TZ_OFFSET_MIN * 60000);
  return { iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
// Converte data local + HH:MM de Palmas para instante UTC (ms).
export function toUTCms(iso, hhmm) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + hhmmToMin(hhmm) * 60000 - TZ_OFFSET_MIN * 60000;
}

export function inSilence(min, cfg) {
  const a = hhmmToMin(cfg.silencioIni), b = hhmmToMin(cfg.silencioFim);
  return a <= b ? (min >= a && min < b) : (min >= a || min < b);
}

// ------------------------------------------------------------------ revisão espaçada (D+1, D+7, D+30, D+60)
export const INTERVALOS = [1, 7, 30, 60];

export function novoCartao(id, frente, verso, hoje, origem = "erro") {
  return { id, frente, verso, origem, nivel: 0, proxima: addDays(hoje, INTERVALOS[0]), criado: hoje, acertos: 0, erros: 0 };
}
export function revisarCartao(card, acertou, hoje) {
  const c = { ...card };
  if (acertou) {
    c.nivel = Math.min(c.nivel + 1, INTERVALOS.length - 1);
    c.acertos += 1;
  } else {
    c.nivel = 0;
    c.erros += 1;
  }
  c.proxima = addDays(hoje, INTERVALOS[c.nivel]);
  c.ultima = hoje;
  return c;
}
export function cartoesVencidos(cards, hoje) {
  return cards.filter((c) => c.proxima <= hoje).sort((a, b) => (a.proxima < b.proxima ? -1 : 1));
}
export function revisoesDoTopico(dataConclusao) {
  return [1, 7, 30].map((d) => ({ nivel: "D" + d, data: addDays(dataConclusao, d) }));
}

// ------------------------------------------------------------------ pontuação
export function pontuarME(respostas, gabarito) { // respostas: {n: "A"}, gabarito: {n: "A"}
  let certas = 0, erradas = 0, branco = 0;
  for (const n of Object.keys(gabarito)) {
    const r = respostas[n];
    if (!r) branco++; else if (r === gabarito[n]) certas++; else erradas++;
  }
  return { certas, erradas, branco, nota: certas };
}
export function pontuarCE(respostas, gabarito) { // errado anula certo
  let certas = 0, erradas = 0, branco = 0;
  for (const n of Object.keys(gabarito)) {
    const r = respostas[n];
    if (!r) branco++; else if (r === gabarito[n]) certas++; else erradas++;
  }
  return { certas, erradas, branco, nota: certas - erradas };
}
export function notaRedacao(nc, ne, tl) {
  if (!tl || tl <= 0) return 0;
  const v = nc - (4 * ne) / tl;
  return Math.max(0, Math.round(v * 100) / 100);
}

// ------------------------------------------------------------------ planejador semanal
// pesos: {disc: peso}; desempenho: {disc: taxa 0..1 | undefined}
export function distribuirBlocos(horas, pesos, desempenho = {}, meta = DEFAULTS.metaAcerto) {
  const total = Math.max(0, Math.round(horas));
  const discs = Object.keys(pesos).filter((d) => pesos[d] > 0);
  if (!total || !discs.length) return {};
  const score = {};
  for (const d of discs) {
    const taxa = desempenho[d];
    const lacuna = taxa === undefined || taxa === null ? 0.15 : Math.max(0, meta - taxa);
    score[d] = pesos[d] * (1 + lacuna * 2);
  }
  const soma = discs.reduce((s, d) => s + score[d], 0);
  const bruto = discs.map((d) => ({ d, v: (score[d] / soma) * total }));
  const out = {};
  let usados = 0;
  for (const b of bruto) { out[b.d] = Math.floor(b.v); usados += out[b.d]; }
  bruto.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || score[b.d] - score[a.d]);
  for (let i = 0; usados < total; i++) { out[bruto[i % bruto.length].d] += 1; usados++; }
  for (const d of Object.keys(out)) if (!out[d]) delete out[d];
  return out;
}

// Distribui os blocos pelos dias, sem repetir a mesma disciplina mais de 2 vezes seguidas no dia.
export function montarSemana(blocos, inicioISO, diasEstudo = DEFAULTS.diasEstudo) {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(inicioISO, i);
    if (diasEstudo.includes(weekday(iso))) dias.push({ data: iso, blocos: [] });
  }
  if (!dias.length) return [];
  const fila = [];
  const rest = { ...blocos };
  // intercala: pega sempre a disciplina com mais blocos restantes, diferente da anterior
  let anterior = null;
  const total = Object.values(rest).reduce((a, b) => a + b, 0);
  for (let k = 0; k < total; k++) {
    const cand = Object.keys(rest).filter((d) => rest[d] > 0).sort((a, b) => rest[b] - rest[a]);
    let escolha = cand.find((d) => d !== anterior) || cand[0];
    fila.push(escolha); rest[escolha]--; anterior = escolha;
  }
  fila.forEach((d, i) => dias[i % dias.length].blocos.push(d));
  return dias;
}

// ------------------------------------------------------------------ LEMBRETES INTELIGENTES
// estado: { cfg, cards, revisoes:[{data}], sessoes:[{inicio(ms), fim(ms), min, tipo}],
//           historico: { slotId: { ignoradosSeguidos, pausadoAte } }, marcos:[{nome,data}],
//           metaSemanalMin, sequencia, desempenho:{disc:taxa} }

// Aprende o horário real: se em >= 3 dos últimos 5 dias com estudo houve início de sessão
// a até 90 min do horário do slot (e não a até 20 min), desloca o slot para a mediana real.
export function horarioAprendido(slotHHMM, sessoes, hojeISO, cfg) {
  const alvo = hhmmToMin(slotHHMM);
  const porDia = new Map();
  for (const s of sessoes || []) {
    const p = localParts(s.inicio);
    if (diffDays(p.iso, hojeISO) <= 0 || diffDays(p.iso, hojeISO) > 14) continue;
    const dist = Math.abs(p.min - alvo);
    if (dist <= 90) {
      const atual = porDia.get(p.iso);
      if (atual === undefined || Math.abs(atual - alvo) > dist) porDia.set(p.iso, p.min);
    }
  }
  const ultimos = [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5).map((e) => e[1]);
  if (ultimos.length < 3) return { hhmm: slotHHMM, ajustado: false };
  const longe = ultimos.filter((m) => Math.abs(m - alvo) > 20);
  if (longe.length < 3) return { hhmm: slotHHMM, ajustado: false };
  const ord = [...longe].sort((a, b) => a - b);
  let med = ord[Math.floor(ord.length / 2)];
  med = Math.round(med / 5) * 5 - 10; // avisa 10 min antes do seu horário real
  if (inSilence(med, cfg)) return { hhmm: slotHHMM, ajustado: false };
  return { hhmm: minToHHMM(med), ajustado: true, motivo: `você costuma estudar perto das ${minToHHMM(med + 10)}` };
}

function slotPausado(hist, id, hojeISO) {
  const h = hist && hist[id];
  return !!(h && h.pausadoAte && hojeISO <= h.pausadoAte);
}

export function planejarDia(estado, hojeISO) {
  const cfg = { ...DEFAULTS.lembretes, ...(estado.cfg || {}) };
  cfg.ativos = { ...DEFAULTS.lembretes.ativos, ...((estado.cfg || {}).ativos || {}) };
  const venc = cartoesVencidos(estado.cards || [], hojeISO).length;
  const revs = (estado.revisoes || []).filter((r) => r.data <= hojeISO && !r.feita).length;
  const fraca = disciplinaMaisFraca(estado.desempenho || {});
  const out = [];
  const add = (r) => { if (!inSilence(hhmmToMin(r.hora), cfg)) out.push(r); };

  // 1) Prazos do concurso: D-3 e D-1
  if (cfg.ativos.prazos) {
    for (const m of estado.marcos || []) {
      if (!m.data || m.status === "estimado") continue;
      const falta = diffDays(hojeISO, m.data);
      if (falta === 3 || falta === 1) {
        add({ id: "prazo:" + m.nome, tipo: "prazo", prioridade: 1, hora: cfg.prazos,
              titulo: `${m.nome}: faltam ${falta} dia${falta > 1 ? "s" : ""}`, corpo: "Toque para ver o calendário.",
              cond: "sempre", abrir: "#calendario" });
      }
    }
  }
  // 2) Revisão da manhã: só se houver o que revisar
  if (cfg.ativos.revisao && (venc + revs) > 0) {
    add({ id: "revisao", tipo: "revisao", prioridade: 3, hora: cfg.revisao,
          titulo: `${venc + revs} revisão${venc + revs > 1 ? "ões" : ""} para hoje`,
          corpo: `${venc} flashcard${venc === 1 ? "" : "s"} vencido${venc === 1 ? "" : "s"}${revs ? ` e ${revs} tópico(s) D+1/7/30` : ""}. Cerca de ${Math.max(5, Math.ceil((venc * 20 + revs * 300) / 60))} min.`,
          cond: "sem-estudo-hoje", abrir: "#estudar" });
  }
  // 3) Sessões rápidas (com horário aprendido e controle de cansaço)
  for (const id of ["rapida1", "rapida2"]) {
    if (!cfg.ativos[id] || slotPausado(estado.historico, id, hojeISO)) continue;
    const ap = horarioAprendido(cfg[id], estado.sessoes, hojeISO, cfg);
    add({ id, tipo: "rapida", prioridade: 4, hora: ap.hhmm, ajustado: ap.ajustado, motivo: ap.motivo || "",
          titulo: "Tem 10 min? Sessão rápida",
          corpo: venc ? `${Math.min(venc, 20)} flashcards vencidos${fraca ? ` + foco em ${fraca}` : ""}.`
                      : (fraca ? `10 questões de ${fraca}, seu ponto mais fraco.` : "10 questões da prova prevista."),
          cond: "meta-dia-aberta+nada-na-ultima-hora", abrir: "#estudar?rapida=1" });
  }
  // 4) Salvar a sequência
  if (cfg.ativos.sequencia && (estado.sequencia || 0) > 0) {
    add({ id: "sequencia", tipo: "sequencia", prioridade: 2, hora: cfg.salvarSequencia,
          titulo: `Sequência de ${estado.sequencia} dia${estado.sequencia > 1 ? "s" : ""} em risco`,
          corpo: "Ainda não teve estudo hoje. 10 minutos salvam a sequência.",
          cond: "sem-estudo-hoje", abrir: "#estudar?rapida=1" });
  }
  // limite diário por prioridade, depois ordena por horário
  out.sort((a, b) => a.prioridade - b.prioridade);
  return out.slice(0, cfg.maxDia).sort((a, b) => hhmmToMin(a.hora) - hhmmToMin(b.hora));
}

export function disciplinaMaisFraca(desempenho) {
  let pior = null, v = 2;
  for (const [d, t] of Object.entries(desempenho)) if (t !== null && t !== undefined && t < v) { v = t; pior = d; }
  return pior;
}

// Decide, no momento do disparo, se o lembrete ainda faz sentido.
export function deveDisparar(lembrete, ctx) {
  // ctx: { agoraMs, sessoes, metaDiariaMin }
  const hoje = localParts(ctx.agoraMs).iso;
  const sessHoje = (ctx.sessoes || []).filter((s) => localParts(s.inicio).iso === hoje);
  const minHoje = sessHoje.reduce((a, s) => a + (s.min || 0), 0);
  const ultimaFim = Math.max(0, ...sessHoje.map((s) => s.fim || s.inicio));
  switch (lembrete.cond) {
    case "sempre": return { ok: true };
    case "sem-estudo-hoje": return minHoje > 0 ? { ok: false, motivo: "já estudou hoje" } : { ok: true };
    case "meta-dia-aberta+nada-na-ultima-hora":
      if (minHoje >= (ctx.metaDiariaMin || 0)) return { ok: false, motivo: "meta do dia cumprida" };
      if (ultimaFim && ctx.agoraMs - ultimaFim < 3600000) return { ok: false, motivo: "estudou na última hora" };
      return { ok: true };
    default: return { ok: true };
  }
}

// Atualiza o histórico de cansaço: 3 lembretes ignorados seguidos -> pausa o horário por 1 dia.
export function registrarResposta(historico, slotId, respondeu, hojeISO) {
  const h = { ...(historico || {}) };
  const s = { ignoradosSeguidos: 0, pausadoAte: null, ...(h[slotId] || {}) };
  if (respondeu) { s.ignoradosSeguidos = 0; s.pausadoAte = null; }
  else {
    s.ignoradosSeguidos += 1;
    if (s.ignoradosSeguidos >= 3) { s.pausadoAte = addDays(hojeISO, 1); s.ignoradosSeguidos = 0; }
  }
  h[slotId] = s;
  return h;
}

// ------------------------------------------------------------------ calendário (.ics)
function icsEsc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function icsUTC(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

export function gerarICS(lembretesPorDia, agoraMs = Date.now()) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Missao PC-TO//Lembretes//PT", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", "X-WR-CALNAME:Missão PC-TO"];
  for (const { data, lembretes } of lembretesPorDia) {
    for (const r of lembretes) {
      const ini = toUTCms(data, r.hora);
      L.push("BEGIN:VEVENT", `UID:${data}-${r.id}@missao-pcto`, `DTSTAMP:${icsUTC(agoraMs)}`,
             `DTSTART:${icsUTC(ini)}`, `DTEND:${icsUTC(ini + 15 * 60000)}`,
             `SUMMARY:${icsEsc("📚 " + r.titulo)}`, `DESCRIPTION:${icsEsc(r.corpo)}`,
             "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(r.titulo)}`, "TRIGGER:-PT0M", "END:VALARM",
             "END:VEVENT");
    }
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
