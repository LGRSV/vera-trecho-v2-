// Missão PC-TO — função "lembretes" (Supabase Edge Function). Roda a cada 5 min pelo Supabase Cron.
// Usa o MESMO motor do app (_shared/engine.js) para decidir o que avisar e quando.
// Segredos necessários: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:seu@email).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import * as E from "../_shared/engine.js";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "estudos" },
});
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

Deno.serve(async () => {
  const agora = Date.now();
  const { iso: hoje, min } = E.localParts(agora);
  const { data: estados, error } = await sb.from("estado").select("user_id, dados");
  if (error) return new Response(error.message, { status: 500 });
  let enviados = 0;
  for (const { user_id, dados } of estados ?? []) {
    const st = dados ?? {};
    const plano = E.planejarDia({
      cfg: st.cfg?.lembretes, cards: st.cards, revisoes: st.revisoes, sessoes: st.sessoes,
      historico: st.historico, marcos: st.marcos, sequencia: st.sequencia ?? 0, desempenho: st.desempenho ?? {},
    }, hoje);
    for (const r of plano) {
      const t = E.hhmmToMin(r.hora);
      if (min < t || min > t + 10) continue; // janela de 10 min após o horário
      const { data: ja } = await sb.from("lembrete_log").select("id").eq("user_id", user_id).eq("dia", hoje).eq("lembrete_id", r.id).maybeSingle();
      if (ja) continue;
      const metaDiariaMin = Math.round(((st.cfg?.horasSemana ?? 12) * 60) / 6);
      const dec = E.deveDisparar(r, { agoraMs: agora, sessoes: st.sessoes ?? [], metaDiariaMin });
      await sb.from("lembrete_log").insert({ user_id, dia: hoje, lembrete_id: r.id, enviado: dec.ok, motivo: dec.motivo ?? null });
      if (!dec.ok) continue;
      const { data: subs } = await sb.from("push_inscricao").select("*").eq("user_id", user_id);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ id: r.id, titulo: r.titulo, corpo: r.corpo, abrir: r.abrir }));
          enviados++;
        } catch (e) {
          if ((e as { statusCode?: number }).statusCode === 410) await sb.from("push_inscricao").delete().eq("id", s.id);
        }
      }
    }
  }
  return Response.json({ ok: true, enviados, hoje, min });
});
