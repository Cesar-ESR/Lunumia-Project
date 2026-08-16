-- Lunumia 2.0 backend-first additive migration.

create table public.balance_anchors (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  captured_at timestamptz not null,
  ledger_cutoff_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint balance_anchors_user_id_id_unique unique (user_id, id)
);

create index balance_anchors_latest_active_idx
  on public.balance_anchors (
    user_id,
    captured_at desc,
    updated_at desc,
    id desc
  )
  where deleted_at is null;

create index balance_anchors_sync_cursor_idx
  on public.balance_anchors (user_id, updated_at, id);

create trigger set_balance_anchors_updated_at
  before update on public.balance_anchors
  for each row execute function private.set_updated_at();

alter table public.balance_anchors enable row level security;

create policy balance_anchors_select_own on public.balance_anchors
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy balance_anchors_insert_own on public.balance_anchors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy balance_anchors_update_own on public.balance_anchors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy balance_anchors_delete_own on public.balance_anchors
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.balance_anchors
  from public, anon, authenticated;
grant select, insert, update, delete on table public.balance_anchors
  to authenticated;

alter table public.incomes
  add column status text,
  add column affects_balance boolean,
  add column balance_effective_at timestamptz;

update public.incomes
set status = 'received',
    affects_balance = true,
    balance_effective_at = created_at;

alter table public.expenses
  add column affects_balance boolean,
  add column balance_effective_at timestamptz;

update public.expenses
set affects_balance = true,
    balance_effective_at = created_at;

alter table public.recurring_payment_occurrences
  add column amount bigint;

update public.recurring_payment_occurrences as occurrence
set amount = payment.amount
from public.recurring_payments as payment
where payment.id = occurrence.recurring_payment_id
  and payment.user_id = occurrence.user_id;

do $$
begin
  if exists (
    select 1 from public.incomes
    where status is null
      or affects_balance is null
      or balance_effective_at is null
  ) then
    raise exception 'lunumia_2_income_backfill_incomplete';
  end if;

  if exists (
    select 1 from public.expenses
    where affects_balance is null
      or balance_effective_at is null
  ) then
    raise exception 'lunumia_2_expense_backfill_incomplete';
  end if;

  if exists (
    select 1 from public.recurring_payment_occurrences
    where amount is null or amount <= 0
  ) then
    raise exception 'lunumia_2_occurrence_amount_backfill_incomplete';
  end if;
end;
$$;

alter table public.incomes
  alter column status set not null,
  alter column affects_balance set not null,
  add constraint incomes_status_check
    check (status in ('expected', 'received', 'cancelled')),
  add constraint incomes_status_balance_effective_check
    check (
      (status = 'received' and balance_effective_at is not null)
      or (status in ('expected', 'cancelled') and balance_effective_at is null)
    );

alter table public.expenses
  alter column affects_balance set not null,
  alter column balance_effective_at set not null;

alter table public.recurring_payment_occurrences
  alter column amount set not null,
  add constraint recurring_occurrences_amount_check check (amount > 0);

create or replace function private.normalize_income_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.incomes%rowtype;
begin
  select income.* into existing
  from public.incomes as income
  where income.id = new.id
    and income.user_id = new.user_id;

  new.status := coalesce(new.status, existing.status, 'received');
  new.affects_balance := coalesce(
    new.affects_balance,
    existing.affects_balance,
    true
  );

  if new.status = 'received' and new.balance_effective_at is null then
    new.balance_effective_at := coalesce(
      existing.balance_effective_at,
      new.created_at,
      now()
    );
  end if;

  return new;
end;
$$;

create or replace function private.normalize_expense_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.expenses%rowtype;
begin
  select expense.* into existing
  from public.expenses as expense
  where expense.id = new.id
    and expense.user_id = new.user_id;

  new.affects_balance := coalesce(
    new.affects_balance,
    existing.affects_balance,
    true
  );
  new.balance_effective_at := coalesce(
    new.balance_effective_at,
    existing.balance_effective_at,
    new.created_at,
    now()
  );

  return new;
end;
$$;

create or replace function private.normalize_occurrence_amount_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_amount bigint;
begin
  if new.amount is null then
    select occurrence.amount into existing_amount
    from public.recurring_payment_occurrences as occurrence
    where occurrence.id = new.id
      and occurrence.user_id = new.user_id;

    new.amount := existing_amount;
  end if;

  if new.amount is null then
    select payment.amount into new.amount
    from public.recurring_payments as payment
    where payment.id = new.recurring_payment_id
      and payment.user_id = new.user_id;
  end if;

  if new.amount is null or new.amount <= 0 then
    raise exception 'occurrence_amount_unresolvable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_income_v2()
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_expense_v2()
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_occurrence_amount_v2()
  from public, anon, authenticated, service_role;

create trigger normalize_income_v2_before_write
  before insert or update on public.incomes
  for each row execute function private.normalize_income_v2();

create trigger normalize_expense_v2_before_write
  before insert or update on public.expenses
  for each row execute function private.normalize_expense_v2();

create trigger normalize_occurrence_amount_v2_before_write
  before insert or update on public.recurring_payment_occurrences
  for each row execute function private.normalize_occurrence_amount_v2();

create or replace function public.apply_sync_operation(
  p_operation_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_table_name text;
  v_update_clause text;
  v_payload jsonb;
  v_incoming_updated_at timestamptz;
  v_entity_updated_at timestamptz;
  v_related_entity_id uuid;
  v_related_updated_at timestamptz;
  v_existing_updated_at timestamptz;
  v_inserted integer;
  v_applied boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_operation_type not in (
    'create',
    'update',
    'delete',
    'pay_recurring_occurrence'
  ) then
    raise exception 'unsupported_operation_type: %', p_operation_type
      using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_an_object' using errcode = '22023';
  end if;

  insert into public.processed_operations (operation_id, user_id, operation_type)
  values (p_operation_id, v_user_id, p_operation_type)
  on conflict (operation_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    if not exists (
      select 1
      from public.processed_operations
      where operation_id = p_operation_id
        and user_id = v_user_id
    ) then
      raise exception 'operation_id_belongs_to_another_user'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'status', 'already_processed',
      'entity_updated_at', null,
      'related_entity_id', null,
      'related_updated_at', null
    );
  end if;

  if p_operation_type = 'pay_recurring_occurrence' then
    if p_entity_type <> 'recurringPaymentOccurrence' then
      raise exception 'compound_operation_requires_occurrence_entity'
        using errcode = '22023';
    end if;
    if (p_payload #>> '{occurrence,id}')::uuid <> p_entity_id then
      raise exception 'payload_entity_id_mismatch' using errcode = '22023';
    end if;
    if (p_payload #>> '{occurrence,user_id}')::uuid <> v_user_id
      or (p_payload #>> '{expense,user_id}')::uuid <> v_user_id then
      raise exception 'payload_owner_mismatch' using errcode = '42501';
    end if;

    v_incoming_updated_at :=
      (p_payload #>> '{occurrence,updated_at}')::timestamptz;
    select updated_at
    into v_existing_updated_at
    from public.recurring_payment_occurrences
    where id = p_entity_id
      and user_id = v_user_id
    for update;

    if v_existing_updated_at is not null
      and v_existing_updated_at >= v_incoming_updated_at then
      return jsonb_build_object(
        'status', 'remote_wins',
        'entity_updated_at', v_existing_updated_at,
        'related_entity_id', null,
        'related_updated_at', null
      );
    end if;

    v_related_entity_id := (p_payload #>> '{expense,id}')::uuid;
    select updated_at
    into v_related_updated_at
    from public.expenses
    where id = v_related_entity_id
      and user_id = v_user_id
    for update;

    if v_related_updated_at is not null
      and v_related_updated_at >=
        (p_payload #>> '{expense,updated_at}')::timestamptz then
      return jsonb_build_object(
        'status', 'remote_wins',
        'entity_updated_at', v_existing_updated_at,
        'related_entity_id', v_related_entity_id,
        'related_updated_at', v_related_updated_at
      );
    end if;

    v_payload := (p_payload -> 'occurrence') || jsonb_build_object(
      'user_id', v_user_id,
      'updated_at', greatest(v_incoming_updated_at, clock_timestamp())
    );
    insert into public.recurring_payment_occurrences
    select (
      jsonb_populate_record(
        null::public.recurring_payment_occurrences,
        v_payload
      )
    ).*
    on conflict (id) do update set
      recurring_payment_id = excluded.recurring_payment_id,
      period_id = excluded.period_id,
      due_date = excluded.due_date,
      status = excluded.status,
      amount = excluded.amount,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
    returning updated_at into v_entity_updated_at;

    v_incoming_updated_at :=
      (p_payload #>> '{expense,updated_at}')::timestamptz;
    v_payload := (p_payload -> 'expense') || jsonb_build_object(
      'user_id', v_user_id,
      'updated_at', greatest(v_incoming_updated_at, clock_timestamp())
    );
    insert into public.expenses
    select (
      jsonb_populate_record(null::public.expenses, v_payload)
    ).*
    on conflict (id) do update set
      period_id = excluded.period_id,
      category_id = excluded.category_id,
      amount = excluded.amount,
      description = excluded.description,
      date = excluded.date,
      recurring_occurrence_id = excluded.recurring_occurrence_id,
      affects_balance = excluded.affects_balance,
      balance_effective_at = excluded.balance_effective_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
    returning updated_at into v_related_updated_at;

    return jsonb_build_object(
      'status', 'applied',
      'entity_updated_at', v_entity_updated_at,
      'related_entity_id', v_related_entity_id,
      'related_updated_at', v_related_updated_at
    );
  end if;

  if (p_payload ->> 'id')::uuid <> p_entity_id then
    raise exception 'payload_entity_id_mismatch' using errcode = '22023';
  end if;
  if (p_payload ->> 'user_id')::uuid <> v_user_id then
    raise exception 'payload_owner_mismatch' using errcode = '42501';
  end if;

  case p_entity_type
    when 'period' then
      v_table_name := 'periods';
      v_update_clause := 'type = excluded.type, start_date = excluded.start_date, end_date = excluded.end_date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'income' then
      v_table_name := 'incomes';
      v_update_clause := 'period_id = excluded.period_id, amount = excluded.amount, description = excluded.description, date = excluded.date, status = excluded.status, affects_balance = excluded.affects_balance, balance_effective_at = excluded.balance_effective_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'expense' then
      v_table_name := 'expenses';
      v_update_clause := 'period_id = excluded.period_id, category_id = excluded.category_id, amount = excluded.amount, description = excluded.description, date = excluded.date, recurring_occurrence_id = excluded.recurring_occurrence_id, affects_balance = excluded.affects_balance, balance_effective_at = excluded.balance_effective_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'category' then
      v_table_name := 'categories';
      v_update_clause := 'name = excluded.name, normalized_name = excluded.normalized_name, color = excluded.color, icon = excluded.icon, is_system = excluded.is_system, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'categoryBudget' then
      v_table_name := 'category_budgets';
      v_update_clause := 'period_id = excluded.period_id, category_id = excluded.category_id, amount = excluded.amount, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'recurringPayment' then
      v_table_name := 'recurring_payments';
      v_update_clause := 'name = excluded.name, amount = excluded.amount, frequency = excluded.frequency, due_date = excluded.due_date, end_date = excluded.end_date, category_id = excluded.category_id, status = excluded.status, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'recurringPaymentOccurrence' then
      v_table_name := 'recurring_payment_occurrences';
      v_update_clause := 'recurring_payment_id = excluded.recurring_payment_id, period_id = excluded.period_id, due_date = excluded.due_date, status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
    when 'userSettings' then
      v_table_name := 'user_settings';
      v_update_clause := 'active_period_id = excluded.active_period_id, currency = excluded.currency, theme = excluded.theme, updated_at = excluded.updated_at';
    else
      raise exception 'unsupported_entity_type: %', p_entity_type
        using errcode = '22023';
  end case;

  v_incoming_updated_at := (p_payload ->> 'updated_at')::timestamptz;
  v_payload := p_payload || jsonb_build_object(
    'user_id', v_user_id,
    'updated_at', greatest(v_incoming_updated_at, clock_timestamp())
  );

  execute format(
    'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, $1)).* '
    || 'on conflict (id) do update set %2$s where $2 > %1$I.updated_at '
    || 'returning updated_at',
    v_table_name,
    v_update_clause
  )
  into v_entity_updated_at
  using v_payload, v_incoming_updated_at;
  get diagnostics v_inserted = row_count;
  v_applied := v_inserted > 0;

  if not v_applied then
    execute format(
      'select updated_at from public.%I where id = $1 and user_id = $2',
      v_table_name
    )
    into v_entity_updated_at
    using p_entity_id, v_user_id;
  end if;

  return jsonb_build_object(
    'status', case when v_applied then 'applied' else 'remote_wins' end,
    'entity_updated_at', v_entity_updated_at,
    'related_entity_id', null,
    'related_updated_at', null
  );
end;
$$;

revoke all on function public.apply_sync_operation(
  uuid,
  text,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.apply_sync_operation(
  uuid,
  text,
  uuid,
  text,
  jsonb
) to authenticated;

create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.processed_operations where user_id = target_user_id;
  delete from public.user_settings where user_id = target_user_id;
  delete from public.expenses where user_id = target_user_id;
  delete from public.recurring_payment_occurrences where user_id = target_user_id;
  delete from public.category_budgets where user_id = target_user_id;
  delete from public.incomes where user_id = target_user_id;
  delete from public.balance_anchors where user_id = target_user_id;
  delete from public.recurring_payments where user_id = target_user_id;
  delete from public.categories where user_id = target_user_id;
  delete from public.periods where user_id = target_user_id;
  delete from public.user_profiles where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_data(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
