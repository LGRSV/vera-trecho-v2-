import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.js";

test("datas: soma de dias com virada de ano", () => {
  assert.equal(E.addDays("2026-12-28", 1), "2026-12-29");
  assert.equal(E.addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(E.addDays("2026-12-28", 30), "2027-01-27");
  assert.equal(E.diffDays("2026-11-17", "2026-12-04"), 17);
  assert.deepEqual(E.revisoesDoTopico("2026-12-28").map((r) => r.data), ["2026-12-29", "2027-01-04", "2027-01-27"]);
});

test("fuso de Palmas (UTC−3)", () => {
  const ms = E.toUTCms("2026-11-18", "07:00");
  assert.equal(new Date(ms).toISOString(), "2026-11-18T10:00:00.000Z");
  assert.deepEqual(E.localParts(ms), { iso: "2026-11-18", min: 420 });
});

test("horário de silêncio (22h–6h30)", () => {
  const c = E.DEFAULTS.lembretes;
  assert.equal(E.inSilence(E.hhmmToMin("23:00"), c), true);
  assert.equal(E.inSilence(E.hhmmToMin("06:00"), c), true);
  assert.equal(E.inSilence(E.hhmmToMin("06:30"), c), false);
  assert.equal(E.inSilence(E.hhmmToMin("21:59"), c), false);
});

test("flashcards: D+1 → D+7 → D+30 → D+60; erro volta para D+1", () => {
  let c = E.novoCartao("q1", "f", "v", "2026-11-17");
  assert.equal(c.proxima, "2026-11-18");
  c = E.revisarCartao(c, true, "2026-11-18"); assert.equal(c.proxima, "2026-11-25");
  c = E.revisarCartao(c, true, "2026-11-25"); assert.equal(c.proxima, "2026-12-25");
  c = E.revisarCartao(c, true, "2026-12-25"); assert.equal(c.proxima, "2027-02-23");
  c = E.revisarCartao(c, false, "2027-02-23"); assert.equal(c.proxima, "2027-02-24");
  assert.equal(E.cartoesVencidos([c], "2027-02-24").length, 1);
});

test("pontuação ME sem desconto e CE com errado anulando certo", () => {
  const gab = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
  assert.deepEqual(E.pontuarME({ 1: "A", 2: "B", 3: "A" }, gab), { certas: 2, erradas: 1, branco: 2, nota: 2 });
  const gce = { 1: "C", 2: "E", 3: "C", 4: "E" };
  assert.equal(E.pontuarCE({ 1: "C", 2: "C", 3: "C" }, gce).nota, 1);
});

test("nota da redação: NC 16, NE 4, TL 30 = 15,47; negativa vira 0", () => {
  assert.equal(E.notaRedacao(16, 4, 30), 15.47);
  assert.equal(E.notaRedacao(1, 30, 10), 0);
});

test("planejador: soma dos blocos = horas, para 4, 12 e 20 h", () => {
  const pesos = { Penal: 8, "Processo Penal": 7, Português: 8, Informática: 10, Constitucional: 6 };
  for (const h of [4, 12, 20]) {
    const b = E.distribuirBlocos(h, pesos, { Penal: 0.4, Português: 0.9 });
    assert.equal(Object.values(b).reduce((a, x) => a + x, 0), h);
  }
  const b = E.distribuirBlocos(12, { A: 1, B: 1 }, { A: 0.3, B: 0.9 });
  assert.ok(b.A > b.B, "disciplina mais fraca ganha mais blocos");
});

test("semana: distribui nos dias de estudo sem perder blocos", () => {
  const sem = E.montarSemana({ Penal: 4, Português: 4, Informática: 4 }, "2026-11-23");
  assert.equal(sem.length, 6);
  assert.equal(sem.reduce((a, d) => a + d.blocos.length, 0), 12);
  for (const d of sem) for (let i = 2; i < d.blocos.length; i++)
    assert.ok(!(d.blocos[i] === d.blocos[i - 1] && d.blocos[i] === d.blocos[i - 2]), "no máx. 2 seguidos");
});

test("lembretes: só lembra a revisão se houver algo vencido", () => {
  const vazio = E.planejarDia({ cards: [], revisoes: [], sessoes: [], sequencia: 0 }, "2026-11-18");
  assert.equal(vazio.find((r) => r.id === "revisao"), undefined);
  const comCards = E.planejarDia({ cards: [E.novoCartao("1", "a", "b", "2026-11-17")], sessoes: [] }, "2026-11-18");
  const rev = comCards.find((r) => r.id === "revisao");
  assert.ok(rev); assert.equal(rev.hora, "07:00");
  assert.deepEqual(comCards.map((r) => r.hora), ["07:00", "12:30", "18:30"]);
});

test("lembretes: respeita silêncio, limite diário e salva sequência", () => {
  const est = { cfg: { rapida2: "22:30" }, cards: [E.novoCartao("1", "a", "b", "2026-11-17")], sequencia: 5,
    marcos: [{ nome: "Fim das inscrições", data: "2026-11-21", status: "confirmado" }] };
  const dia = E.planejarDia(est, "2026-11-18");
  assert.equal(dia.find((r) => r.id === "rapida2"), undefined, "22:30 cai no silêncio");
  assert.ok(dia.find((r) => r.tipo === "prazo"), "aviso D-3 do prazo");
  assert.ok(dia.find((r) => r.id === "sequencia"));
  assert.ok(dia.length <= 4);
});

test("lembretes: aprende o horário real de estudo", () => {
  const sessoes = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-16"].map((d) => ({
    inicio: E.toUTCms(d, "13:15"), fim: E.toUTCms(d, "13:30"), min: 15 }));
  const ap = E.horarioAprendido("12:30", sessoes, "2026-11-18", E.DEFAULTS.lembretes);
  assert.equal(ap.ajustado, true);
  assert.equal(ap.hhmm, "13:05");
  const nada = E.horarioAprendido("12:30", sessoes.slice(0, 2), "2026-11-18", E.DEFAULTS.lembretes);
  assert.equal(nada.ajustado, false);
});

test("lembretes: não dispara se já estudou ou se estudou na última hora", () => {
  const agora = E.toUTCms("2026-11-18", "18:30");
  const sess = [{ inicio: E.toUTCms("2026-11-18", "17:50"), fim: E.toUTCms("2026-11-18", "18:05"), min: 15 }];
  assert.equal(E.deveDisparar({ cond: "sem-estudo-hoje" }, { agoraMs: agora, sessoes: sess }).ok, false);
  assert.equal(E.deveDisparar({ cond: "meta-dia-aberta+nada-na-ultima-hora" },
    { agoraMs: agora, sessoes: sess, metaDiariaMin: 120 }).ok, false);
  assert.equal(E.deveDisparar({ cond: "meta-dia-aberta+nada-na-ultima-hora" },
    { agoraMs: agora, sessoes: [], metaDiariaMin: 120 }).ok, true);
});

test("lembretes: 3 ignorados seguidos pausam o horário por 1 dia", () => {
  let h = {};
  for (let i = 0; i < 3; i++) h = E.registrarResposta(h, "rapida1", false, "2026-11-18");
  assert.equal(h.rapida1.pausadoAte, "2026-11-19");
  const dia = E.planejarDia({ historico: h, cards: [], sessoes: [] }, "2026-11-19");
  assert.equal(dia.find((r) => r.id === "rapida1"), undefined);
  h = E.registrarResposta(h, "rapida1", true, "2026-11-19");
  assert.equal(h.rapida1.pausadoAte, null);
});

test("ICS: evento com alarme no horário certo (UTC)", () => {
  const ics = E.gerarICS([{ data: "2026-11-18", lembretes: [{ id: "revisao", hora: "07:00", titulo: "T", corpo: "C" }] }],
    Date.UTC(2026, 10, 17));
  assert.match(ics, /DTSTART:20261118T100000Z/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
