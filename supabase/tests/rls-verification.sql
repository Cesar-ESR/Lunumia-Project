-- Prueba destructiva solo dentro de una transacción que siempre termina en ROLLBACK.
-- Requiere dos usuarios desechables ya creados en Supabase local.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v user_a='<uuid-a>' -v user_b='<uuid-b>' -f supabase/tests/rls-verification.sql

begin;
select set_config('test.user_a', :'user_a', true);
select set_config('test.user_b', :'user_b', true);

create temporary table rls_fixtures (
  table_name text primary key,
  payload jsonb not null
) on commit drop;
grant select, insert on table rls_fixtures to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);

insert into public.periods (id, user_id, type, start_date, end_date)
values ('10000000-0000-4000-8000-000000000001', :'user_a', 'monthly', '2026-08-01', '2026-08-31');
insert into public.categories (id, user_id, name, normalized_name, color)
values ('10000000-0000-4000-8000-000000000002', :'user_a', 'Prueba A', 'prueba a', '#112233');
insert into public.incomes (id, user_id, period_id, amount, description, date)
values ('10000000-0000-4000-8000-000000000003', :'user_a', '10000000-0000-4000-8000-000000000001', 10000, 'Ingreso A', '2026-08-01');
insert into public.recurring_payments (id, user_id, name, amount, frequency, due_date, category_id, status)
values ('10000000-0000-4000-8000-000000000004', :'user_a', 'Pago A', 1000, 'monthly', '2026-08-05', '10000000-0000-4000-8000-000000000002', 'active');
insert into public.recurring_payment_occurrences (id, user_id, recurring_payment_id, period_id, due_date, status)
values ('10000000-0000-4000-8000-000000000005', :'user_a', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '2026-08-05', 'pending');
insert into public.expenses (id, user_id, period_id, category_id, amount, description, date)
values ('10000000-0000-4000-8000-000000000006', :'user_a', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 500, 'Gasto A', '2026-08-02');
insert into public.category_budgets (id, user_id, period_id, category_id, amount)
values ('10000000-0000-4000-8000-000000000007', :'user_a', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 5000);
insert into public.user_settings (id, user_id, active_period_id, currency, theme)
values ('10000000-0000-4000-8000-000000000008', :'user_a', '10000000-0000-4000-8000-000000000001', 'MXN', 'system');
insert into public.processed_operations (operation_id, user_id, operation_type)
values ('10000000-0000-4000-8000-000000000009', :'user_a', 'create');

insert into rls_fixtures (table_name, payload)
select 'periods', to_jsonb(row_value) from public.periods row_value where user_id = :'user_a'
union all select 'categories', to_jsonb(row_value) from public.categories row_value where user_id = :'user_a'
union all select 'incomes', to_jsonb(row_value) from public.incomes row_value where user_id = :'user_a'
union all select 'recurring_payments', to_jsonb(row_value) from public.recurring_payments row_value where user_id = :'user_a'
union all select 'recurring_payment_occurrences', to_jsonb(row_value) from public.recurring_payment_occurrences row_value where user_id = :'user_a'
union all select 'expenses', to_jsonb(row_value) from public.expenses row_value where user_id = :'user_a'
union all select 'category_budgets', to_jsonb(row_value) from public.category_budgets row_value where user_id = :'user_a'
union all select 'user_settings', to_jsonb(row_value) from public.user_settings row_value where user_id = :'user_a';

select set_config('request.jwt.claim.sub', :'user_b', true);

do $$
declare
  fixture record;
  affected integer;
  visible integer;
begin
  for fixture in select table_name, payload from rls_fixtures loop
    execute format('select count(*) from public.%I where user_id = $1', fixture.table_name)
      into visible using current_setting('test.user_a')::uuid;
    if visible <> 0 then
      raise exception 'RLS permitió SELECT cross-user en %', fixture.table_name;
    end if;

    execute format('update public.%I set updated_at = now() where user_id = $1', fixture.table_name)
      using current_setting('test.user_a')::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then
      raise exception 'RLS permitió UPDATE cross-user en %', fixture.table_name;
    end if;

    execute format('delete from public.%I where user_id = $1', fixture.table_name)
      using current_setting('test.user_a')::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then
      raise exception 'RLS permitió DELETE cross-user en %', fixture.table_name;
    end if;

    begin
      fixture.payload := fixture.payload || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', current_setting('test.user_a')::uuid
      );
      execute format(
        'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, $1)).*',
        fixture.table_name
      ) using fixture.payload;
      raise exception 'RLS permitió INSERT cross-user en %', fixture.table_name;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end;
$$;

do $$
declare
  affected integer;
  visible integer;
begin
  select count(*) into visible
  from public.user_profiles
  where id = current_setting('test.user_a')::uuid;
  if visible <> 0 then raise exception 'RLS permitió SELECT cross-user en user_profiles'; end if;

  update public.user_profiles set display_name = 'cross-user'
  where id = current_setting('test.user_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'RLS permitió UPDATE cross-user en user_profiles'; end if;

  delete from public.user_profiles where id = current_setting('test.user_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'RLS permitió DELETE cross-user en user_profiles'; end if;

  begin
    insert into public.user_profiles (id, display_name)
    values (current_setting('test.user_a')::uuid, 'cross-user');
    raise exception 'RLS permitió INSERT cross-user en user_profiles';
  exception when insufficient_privilege then null;
  end;

  select count(*) into visible
  from public.processed_operations
  where user_id = current_setting('test.user_a')::uuid;
  if visible <> 0 then raise exception 'RLS permitió SELECT cross-user en processed_operations'; end if;

  begin
    update public.processed_operations set operation_type = 'cross-user'
    where user_id = current_setting('test.user_a')::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'RLS permitió UPDATE cross-user en processed_operations'; end if;
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.processed_operations
    where user_id = current_setting('test.user_a')::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'RLS permitió DELETE cross-user en processed_operations'; end if;
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.processed_operations (operation_id, user_id, operation_type)
    values (gen_random_uuid(), current_setting('test.user_a')::uuid, 'create');
    raise exception 'RLS permitió INSERT cross-user en processed_operations';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  entity_id uuid := gen_random_uuid();
begin
  begin
    perform public.apply_sync_operation(
      gen_random_uuid(),
      'period',
      entity_id,
      'create',
      jsonb_build_object(
        'id', entity_id,
        'user_id', current_setting('test.user_a')::uuid,
        'type', 'monthly',
        'start_date', '2027-01-01',
        'end_date', '2027-01-31',
        'created_at', now(),
        'updated_at', now()
      )
    );
    raise exception 'apply_sync_operation aceptó un owner distinto del JWT';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('anon', 'public.periods', 'select') then
    raise exception 'El rol anon conserva SELECT sobre periods';
  end if;
end;
$$;

rollback;
