-- Verifica límites, ventana, aislamiento A/B y privilegios en Supabase local.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v user_a='<uuid-a>' -v user_b='<uuid-b>' -f supabase/tests/rate-limit-verification.sql

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);

do $$
declare
  result record;
  request_number integer;
begin
  for request_number in 1..10 loop
    select * into result from public.consume_rate_limit('ai-insights');
    if not result.allowed then raise exception 'Solicitud A % fue bloqueada antes del límite', request_number; end if;
  end loop;
  select * into result from public.consume_rate_limit('ai-insights');
  if result.allowed or result.remaining <> 0 then raise exception 'Solicitud 11 no fue bloqueada'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', :'user_b', true);
do $$
declare result record;
begin
  select * into result from public.consume_rate_limit('ai-insights');
  if not result.allowed then raise exception 'El contador de A contaminó al usuario B'; end if;
end;
$$;

reset role;
update private.edge_rate_limits
set window_started_at = window_started_at - interval '61 seconds'
where user_id = :'user_a' and scope = 'ai-insights';

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);
do $$
declare result record;
begin
  select * into result from public.consume_rate_limit('ai-insights');
  if not result.allowed or result.remaining <> 9 then raise exception 'La ventana vencida no reinició el contador'; end if;
end;
$$;

do $$
begin
  begin
    perform * from private.edge_rate_limits;
    raise exception 'authenticated pudo leer el storage privado';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
