-- Atomic, distributed fixed-window rate limits for authenticated Edge Functions.
-- The table lives outside exposed schemas and stores no request content or tokens.
create schema if not exists private;

create table private.edge_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (user_id, scope),
  constraint edge_rate_limits_scope_check
    check (scope in ('ai-insights', 'recognize-receipt')),
  constraint edge_rate_limits_request_count_check
    check (request_count >= 1)
);

create table private.edge_rate_limit_policies (
  scope text primary key,
  request_limit integer not null check (request_limit between 1 and 1000),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  constraint edge_rate_limit_policies_scope_check
    check (scope in ('ai-insights', 'recognize-receipt'))
);

insert into private.edge_rate_limit_policies (scope, request_limit, window_seconds)
values ('ai-insights', 10, 60), ('recognize-receipt', 5, 60);

alter table private.edge_rate_limits enable row level security;
alter table private.edge_rate_limit_policies enable row level security;

revoke all on schema private from public, anon, authenticated;
revoke all on table private.edge_rate_limits from public, anon, authenticated;
revoke all on table private.edge_rate_limit_policies
  from public, anon, authenticated;

create or replace function private.consume_edge_rate_limit(p_scope text)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_limit integer;
  v_window_seconds integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select policy.request_limit, policy.window_seconds
  into v_limit, v_window_seconds
  from private.edge_rate_limit_policies as policy
  where policy.scope = p_scope;

  if not found then
    raise exception 'invalid rate-limit scope' using errcode = '22023';
  end if;

  return query
  insert into private.edge_rate_limits as limits (
    user_id,
    scope,
    window_started_at,
    request_count
  )
  values (v_user_id, p_scope, v_now, 1)
  on conflict (user_id, scope) do update
  set
    window_started_at = case
      when limits.window_started_at + make_interval(secs => v_window_seconds) <= v_now
        then v_now
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at + make_interval(secs => v_window_seconds) <= v_now
        then 1
      else least(limits.request_count + 1, v_limit + 1)
    end
  returning
    limits.request_count <= v_limit,
    greatest(v_limit - limits.request_count, 0),
    limits.window_started_at + make_interval(secs => v_window_seconds);
end;
$$;

revoke all on function private.consume_edge_rate_limit(text)
  from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.consume_edge_rate_limit(text)
  to authenticated;

create or replace function public.consume_rate_limit(p_scope text)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.consume_edge_rate_limit(p_scope);
$$;

revoke all on function public.consume_rate_limit(text)
  from public, anon;
grant execute on function public.consume_rate_limit(text)
  to authenticated;

comment on table private.edge_rate_limits is
  'Per-user fixed-window counters for authenticated Edge Functions; no request payloads or tokens.';
comment on function public.consume_rate_limit(text) is
  'Atomically consumes one authenticated user request in an allowlisted rate-limit scope.';
