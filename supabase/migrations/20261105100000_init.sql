-- Голосование «Ценности школы» — облачная версия (Supabase).
-- Таблицы закрыты RLS; браузер работает только через функции sv_* (security definer).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.sv_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null,
  pin_hash text not null,
  one_vote_per_device boolean not null default true,
  rev bigint not null default 0
);

create table if not exists public.sv_team (
  team text primary key,
  mode text not null default 'voting' check (mode in ('voting', 'results')),
  voters int not null default 0
);

create table if not exists public.sv_count (
  team text not null references public.sv_team (team) on delete cascade,
  value text not null,
  n int not null default 0,
  primary key (team, value)
);

create table if not exists public.sv_ballot (
  id bigserial primary key,
  team text not null,
  choices text[] not null,
  device text,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sv_device (
  device text primary key,
  team text not null,
  choices text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sv_fail (
  at timestamptz not null default now()
);

alter table public.sv_config enable row level security;
alter table public.sv_team enable row level security;
alter table public.sv_count enable row level security;
alter table public.sv_ballot enable row level security;
alter table public.sv_device enable row level security;
alter table public.sv_fail enable row level security;
revoke all on public.sv_config, public.sv_team, public.sv_count, public.sv_ballot, public.sv_device, public.sv_fail
  from anon, authenticated;

-- ───────── начальные данные (PIN задаётся отдельно, здесь — случайный) ─────────
insert into public.sv_config (id, config, pin_hash)
values (1, $json${
  "title": "Собери формулу школы",
  "subtitle": "Ценности школы",
  "question": "Выбери 5 главных ценностей школы, в которой хочется учиться",
  "formulaResult": "школа, в которой хочется учиться",
  "picks": 5,
  "order": ["A", "B"],
  "teams": {
    "A": { "name": "Территория А", "letter": "А", "color": "#2b7bff", "accent": "#5ee7ff" },
    "B": { "name": "Территория Б", "letter": "Б", "color": "#ff5a36", "accent": "#ffc24b" }
  },
  "values": ["Уважение", "Безопасность", "Справедливость", "Доверие", "Поддержка", "Ответственность",
             "Диалог", "Принятие", "Равноправие", "Достоинство", "Взаимопомощь", "Свобода мнения",
             "Эмпатия", "Нетерпимость к травле", "Сотрудничество"]
}$json$::jsonb, extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')))
on conflict (id) do update set config = excluded.config;

insert into public.sv_team (team) values ('A'), ('B') on conflict do nothing;

insert into public.sv_count (team, value)
select t.team, v
from public.sv_team t, jsonb_array_elements_text((select config -> 'values' from public.sv_config where id = 1)) v
on conflict do nothing;

-- ───────── публичное состояние (экраны, телефоны) ─────────
create or replace function public.sv_public()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'rev', c.rev,
    'config', c.config,
    'teams', (
      select jsonb_object_agg(t.team, jsonb_build_object(
        'mode', t.mode,
        'voters', t.voters,
        'counts', coalesce((select jsonb_object_agg(k.value, k.n) from sv_count k where k.team = t.team), '{}'::jsonb)
      ))
      from sv_team t
    )
  )
  from sv_config c
  where c.id = 1;
$$;

-- ───────── внутреннее: засчитать бюллетень ─────────
create or replace function public.sv_apply_ballot(p_team text, p_choices text[], p_device text, p_demo boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into sv_ballot (team, choices, device, demo) values (p_team, p_choices, p_device, p_demo);
  update sv_count set n = n + 1 where team = p_team and value = any (p_choices);
  update sv_team set voters = voters + 1 where team = p_team;
  update sv_config set rev = rev + 1 where id = 1;
end;
$$;
revoke all on function public.sv_apply_ballot(text, text[], text, boolean) from public, anon, authenticated;

-- ───────── голос с телефона ─────────
create or replace function public.sv_vote(p_team text, p_choices text[], p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c sv_config;
  t sv_team;
  uniq text[];
  picks int;
  prev sv_device;
begin
  select * into c from sv_config where id = 1;
  select * into t from sv_team where team = p_team for update;
  if not found then
    return jsonb_build_object('error', 'team', 'message', 'Неизвестная территория');
  end if;
  if t.mode <> 'voting' then
    return jsonb_build_object('error', 'closed', 'message', 'Голосование уже завершено');
  end if;

  picks := (c.config ->> 'picks')::int;
  select array_agg(x order by o) into uniq
  from (select x, min(o) as o from unnest(p_choices) with ordinality as u(x, o) group by x) s;
  if uniq is null or cardinality(uniq) <> picks
     or exists (select 1 from unnest(uniq) x where not ((c.config -> 'values') ? x)) then
    return jsonb_build_object('error', 'invalid', 'message', 'Нужно выбрать ровно ' || picks);
  end if;

  if p_device is not null and p_device !~ '^[A-Za-z0-9_-]{8,80}$' then
    p_device := null;
  end if;

  if c.one_vote_per_device and p_device is not null then
    insert into sv_device (device, team, choices) values (p_device, p_team, uniq) on conflict (device) do nothing;
    if not found then
      select * into prev from sv_device where device = p_device;
      return jsonb_build_object('error', 'already', 'message', 'С этого телефона уже проголосовали',
        'voted', jsonb_build_object('team', prev.team, 'c', to_jsonb(prev.choices)));
    end if;
  elsif p_device is not null then
    insert into sv_device (device, team, choices) values (p_device, p_team, uniq)
    on conflict (device) do update set team = excluded.team, choices = excluded.choices, created_at = now();
  end if;

  perform sv_apply_ballot(p_team, uniq, p_device, false);
  return jsonb_build_object('ok', true, 'voters', t.voters + 1);
end;
$$;

-- ───────── «я уже голосовал?» + всё, что нужно странице телефона ─────────
create or replace function public.sv_me(p_device text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'config', c.config,
    'modes', (select jsonb_object_agg(team, mode) from sv_team),
    'voted', case when c.one_vote_per_device then
      (select jsonb_build_object('team', d.team, 'c', to_jsonb(d.choices)) from sv_device d where d.device = p_device)
    end
  )
  from sv_config c
  where c.id = 1;
$$;

-- ───────── пульт ведущего (по PIN) ─────────
create or replace function public.sv_admin(p_pin text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c sv_config;
  teams text[];
  n int;
  i int;
  pick text[];
  tm text;
begin
  if (select count(*) from sv_fail where at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('error', 'locked', 'message', 'Слишком много неверных PIN. Подождите 10 минут.');
  end if;
  select * into c from sv_config where id = 1;
  if p_pin is null or crypt(p_pin, c.pin_hash) <> c.pin_hash then
    insert into sv_fail default values;
    return jsonb_build_object('error', 'pin', 'message', 'Неверный PIN');
  end if;
  delete from sv_fail where at < now() - interval '1 day';

  if p_args ->> 'team' = 'all' then
    teams := array(select team from sv_team order by team);
  else
    teams := array(select team from sv_team where team = p_args ->> 'team');
  end if;

  case p_action
    when 'state' then
      null;
    when 'mode' then
      if p_args ->> 'mode' not in ('voting', 'results') or cardinality(teams) = 0 then
        return jsonb_build_object('error', 'bad', 'message', 'Неверные параметры');
      end if;
      update sv_team set mode = p_args ->> 'mode' where team = any (teams);
      update sv_config set rev = rev + 1 where id = 1;
    when 'settings' then
      if p_args ? 'oneVotePerDevice' then
        update sv_config set one_vote_per_device = (p_args ->> 'oneVotePerDevice')::boolean, rev = rev + 1 where id = 1;
      end if;
    when 'reset' then
      if cardinality(teams) = 0 then
        return jsonb_build_object('error', 'bad', 'message', 'Неверные параметры');
      end if;
      delete from sv_ballot where team = any (teams);
      delete from sv_device where team = any (teams);
      update sv_count set n = 0 where team = any (teams);
      update sv_team set voters = 0, mode = 'voting' where team = any (teams);
      update sv_config set rev = rev + 1 where id = 1;
    when 'demo' then
      n := least(greatest(coalesce((p_args ->> 'n')::int, 1), 1), 50);
      for i in 1 .. n loop
        foreach tm in array teams loop
          if (select mode from sv_team where team = tm) = 'voting' then
            -- взвешенная случайная выборка, чтобы появились явные лидеры
            select array_agg(v) into pick from (
              select v from jsonb_array_elements_text(c.config -> 'values') v
              order by -ln(random()) / (0.15 + ((hashtext(v || tm || to_char(now(), 'YYYYMMDDHH24')) & 1023) / 1023.0) ^ 2)
              limit (c.config ->> 'picks')::int
            ) s;
            perform sv_apply_ballot(tm, pick, null, true);
          end if;
        end loop;
      end loop;
    when 'export' then
      return jsonb_build_object('ballots', coalesce((
        select jsonb_agg(jsonb_build_object('team', b.team, 't', b.created_at, 'c', to_jsonb(b.choices), 'demo', b.demo) order by b.id)
        from sv_ballot b
      ), '[]'::jsonb));
    when 'pin' then
      if coalesce(length(p_args ->> 'newPin'), 0) < 4 then
        return jsonb_build_object('error', 'bad', 'message', 'Новый PIN — минимум 4 символа');
      end if;
      update sv_config set pin_hash = crypt(p_args ->> 'newPin', gen_salt('bf')) where id = 1;
    else
      return jsonb_build_object('error', 'bad', 'message', 'Неизвестное действие');
  end case;

  select * into c from sv_config where id = 1;
  return sv_public() || jsonb_build_object('settings', jsonb_build_object('oneVotePerDevice', c.one_vote_per_device));
end;
$$;

revoke all on function public.sv_public(), public.sv_vote(text, text[], text), public.sv_me(text),
  public.sv_admin(text, text, jsonb) from public;
grant execute on function public.sv_public(), public.sv_vote(text, text[], text), public.sv_me(text),
  public.sv_admin(text, text, jsonb) to anon, authenticated;
