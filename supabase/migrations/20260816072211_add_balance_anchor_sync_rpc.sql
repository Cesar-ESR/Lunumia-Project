-- D6: RPC-only additive sync support for Lunumia 2.0 balance anchors.
-- Table definitions, RLS policies, and function signatures remain unchanged.

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
    when 'balanceAnchor' then
      v_table_name := 'balance_anchors';
      v_update_clause := 'amount = excluded.amount, captured_at = excluded.captured_at, ledger_cutoff_at = excluded.ledger_cutoff_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at';
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

create or replace function public.fetch_sync_changes(
  p_entity_type text,
  p_updated_at timestamptz default null,
  p_entity_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_table_name text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'page_limit_must_be_between_1_and_100' using errcode = '22023';
  end if;
  if (p_updated_at is null) <> (p_entity_id is null) then
    raise exception 'cursor_fields_must_both_be_null_or_non_null' using errcode = '22023';
  end if;

  v_table_name := case p_entity_type
    when 'period' then 'periods'
    when 'income' then 'incomes'
    when 'expense' then 'expenses'
    when 'category' then 'categories'
    when 'categoryBudget' then 'category_budgets'
    when 'recurringPayment' then 'recurring_payments'
    when 'recurringPaymentOccurrence' then 'recurring_payment_occurrences'
    when 'balanceAnchor' then 'balance_anchors'
    when 'userSettings' then 'user_settings'
    else null
  end;
  if v_table_name is null then
    raise exception 'unsupported_entity_type: %', p_entity_type using errcode = '22023';
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(sync_row) order by sync_row.updated_at, sync_row.id), ''[]''::jsonb) '
    || 'from (select * from public.%I where user_id = $1 '
    || 'and ($2 is null or (updated_at, id) > ($2, $3)) '
    || 'order by updated_at, id limit $4) as sync_row',
    v_table_name
  )
  into v_result
  using v_user_id, p_updated_at, p_entity_id, p_limit;

  return v_result;
end;
$$;

revoke all on function public.fetch_sync_changes(text, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.fetch_sync_changes(text, timestamptz, uuid, integer)
  to authenticated;
