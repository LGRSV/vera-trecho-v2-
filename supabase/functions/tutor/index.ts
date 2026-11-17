// Missão PC-TO — função "tutor" (agente de dúvidas). A chave da IA fica SÓ aqui, como segredo do Supabase.
// Segredos: IA_PROVEDOR ("gemini" ou "anthropic"), IA_CHAVE, IA_MODELO (opcional), LIMITE_DIARIO (opcional).
const SISTEMA = `Você é o tutor do app Missão PC-TO (concurso da Polícia Civil do Tocantins, cargo Oficial Investigador).
Responda em português do Brasil, de forma curta e didática.
Use APENAS a questão, o gabarito comentado e a base legal enviados. Sempre cite o artigo e a lei.
Se a resposta não estiver nessa base, diga claramente que não sabe e indique em qual lei conferir. Nunca invente jurisprudência.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  const { pergunta, questao } = await req.json();
  if (!pergunta || !questao) return Response.json({ erro: "envie pergunta e questao" }, { status: 400, headers: cors() });
  const contexto = `QUESTÃO ${questao.n} (${questao.disc}): ${questao.enun}\nALTERNATIVAS: ${questao.opts.join(" | ")}\n` +
    `GABARITO: ${questao.resp}\nCOMENTÁRIO: ${questao.com}\nBASE LEGAL: ${questao.base}`;
  const prov = Deno.env.get("IA_PROVEDOR") ?? "gemini";
  const chave = Deno.env.get("IA_CHAVE");
  if (!chave) return Response.json({ erro: "IA_CHAVE não configurada" }, { status: 503, headers: cors() });
  let texto = "";
  if (prov === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("IA_MODELO") ?? "claude-haiku-5-5", max_tokens: 600, system: SISTEMA,
        messages: [{ role: "user", content: `${contexto}\n\nDÚVIDA: ${pergunta}` }] }),
    });
    const j = await r.json(); texto = j.content?.[0]?.text ?? JSON.stringify(j);
  } else {
    const modelo = Deno.env.get("IA_MODELO") ?? "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SISTEMA }] },
        contents: [{ role: "user", parts: [{ text: `${contexto}\n\nDÚVIDA: ${pergunta}` }] }] }),
    });
    const j = await r.json(); texto = j.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(j);
  }
  return Response.json({ resposta: texto }, { headers: cors() });
});

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
}
