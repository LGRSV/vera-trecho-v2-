-- Missão PC-TO — schema "estudos" (Supabase). NÃO executado ainda: depende da sua autorização.
-- Rode no SQL Editor do projeto escolhido.
create schema if not exists estudos;

-- Estado do app (o app envia uma cópia do estado para a nuvem; a função de lembretes lê daqui).
create table if not exists estudos.estado (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Inscrição de notificação (Web Push) de cada aparelho.
create table if not exists estudos.push_inscricao (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

-- Registro de cada lembrete enviado ou pulado (evita duplicar e alimenta o anticansaço).
create table if not exists estudos.lembrete_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  lembrete_id text not null,
  enviado boolean not null,
  motivo text,
  criado_em timestamptz not null default now(),
  unique (user_id, dia, lembrete_id)
);

alter table estudos.estado enable row level security;
alter table estudos.push_inscricao enable row level security;
alter table estudos.lembrete_log enable row level security;

create policy "dono le e grava estado" on estudos.estado for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono gerencia inscricoes" on estudos.push_inscricao for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono le log" on estudos.lembrete_log for select using (auth.uid() = user_id);

-- Agendamento: chama a função "lembretes" a cada 5 minutos (pg_cron + pg_net).
-- Antes, guarde no Vault: project_url e service_role_key.
-- select cron.schedule('missao-pcto-lembretes', '*/5 * * * *', $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/lembretes',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     body := '{}'::jsonb);
-- $$);
