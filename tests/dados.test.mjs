import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const Q = JSON.parse(readFileSync(new URL("../data/questoes.json", import.meta.url)));
const P = JSON.parse(readFileSync(new URL("../data/plano.json", import.meta.url)));

test("simulado: 80 questões, 5 alternativas, gabarito válido e sem repetição", () => {
  assert.equal(Q.questoes.length, 80);
  Q.questoes.forEach((q, i) => {
    assert.equal(q.n, i + 1);
    assert.equal(q.opts.length, 5);
    assert.equal(new Set(q.opts).size, 5, `alternativas repetidas na ${q.n}`);
    assert.match(q.resp, /^[A-E]$/);
    assert.ok(q.com && q.base, `comentário/base faltando na ${q.n}`);
  });
});

test("simulado: disciplinas batem com o plano e com a distribuição prevista", () => {
  const nomes = new Set(P.disciplinas.map((d) => d.nome));
  for (const q of Q.questoes) assert.ok(nomes.has(q.disc), q.disc);
  for (const d of P.disciplinas) {
    assert.equal(Q.questoes.filter((q) => q.disc === d.nome).length, d.peso, d.nome);
  }
});

test("motor do Supabase é cópia exata do motor do app", () => {
  const a = readFileSync(new URL("../js/engine.js", import.meta.url), "utf8");
  const b = readFileSync(new URL("../supabase/functions/_shared/engine.js", import.meta.url), "utf8");
  assert.equal(a, b);
});
