-- Smoke tests for Lunumia 2.0 backend compatibility.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v user_a='<uuid-a>' -f supabase/tests/lunumia-2-migration-verification.sql

begin;
select set_config('test.user_a', :'user_a', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);

insert into public.periods (id, user_id, type, start_date, end_date)
values (
  '20000000-0000-4000-8000-000000000001',
  :'user_a',
  'monthly',
  '2099-01-01',
  '2099-01-31'
);

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  color
)
values (
  '20000000-0000-4000-8000-000000000002',
  :'user_a',
  'Lunumia D3',
  'lunumia d3',
  '#123456'
);

insert into public.recurring_payments (
  id,
  user_id,
  name,
  amount,
  frequency,
  due_date,
  category_id,
  status
)
values (
  '20000000-0000-4000-8000-000000000003',
  :'user_a',
  'Pago D3',
  34500,
  'monthly',
  '2099-01-10',
  '20000000-0000-4000-8000-000000000002',
  'active'
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000010',
  'income',
  '20000000-0000-4000-8000-000000000011',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000011',
    'user_id', :'user_a',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'amount', 100000,
    'description', 'Legacy income',
    'date', '2099-01-02',
    'created_at', '2099-01-02T12:00:00Z',
    'updated_at', '2099-01-02T12:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000020',
  'expense',
  '20000000-0000-4000-8000-000000000021',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000021',
    'user_id', :'user_a',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'category_id', '20000000-0000-4000-8000-000000000002',
    'amount', 5000,
    'description', 'Legacy expense',
    'date', '2099-01-03',
    'recurring_occurrence_id', null,
    'created_at', '2099-01-03T12:00:00Z',
    'updated_at', '2099-01-03T12:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000030',
  'recurringPaymentOccurrence',
  '20000000-0000-4000-8000-000000000031',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000031',
    'user_id', :'user_a',
    'recurring_payment_id', '20000000-0000-4000-8000-000000000003',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'due_date', '2099-01-10',
    'status', 'pending',
    'created_at', '2099-01-01T12:00:00Z',
    'updated_at', '2099-01-01T12:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000040',
  'income',
  '20000000-0000-4000-8000-000000000041',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000041',
    'user_id', :'user_a',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'amount', 125000,
    'description', 'Expected income',
    'date', '2099-01-15',
    'status', 'expected',
    'affects_balance', true,
    'balance_effective_at', null,
    'created_at', '2099-01-01T13:00:00Z',
    'updated_at', '2099-01-01T13:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000050',
  'income',
  '20000000-0000-4000-8000-000000000051',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000051',
    'user_id', :'user_a',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'amount', 80000,
    'description', 'Historical received income',
    'date', '2099-01-04',
    'status', 'received',
    'affects_balance', false,
    'balance_effective_at', '2099-01-05T08:00:00Z',
    'created_at', '2099-01-01T14:00:00Z',
    'updated_at', '2099-01-01T14:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000060',
  'expense',
  '20000000-0000-4000-8000-000000000061',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000061',
    'user_id', :'user_a',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'category_id', '20000000-0000-4000-8000-000000000002',
    'amount', 7500,
    'description', 'Historical expense',
    'date', '2099-01-06',
    'recurring_occurrence_id', null,
    'affects_balance', false,
    'balance_effective_at', '2099-01-07T08:00:00Z',
    'created_at', '2099-01-01T15:00:00Z',
    'updated_at', '2099-01-01T15:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '20000000-0000-4000-8000-000000000070',
  'recurringPaymentOccurrence',
  '20000000-0000-4000-8000-000000000071',
  'create',
  jsonb_build_object(
    'id', '20000000-0000-4000-8000-000000000071',
    'user_id', :'user_a',
    'recurring_payment_id', '20000000-0000-4000-8000-000000000003',
    'period_id', '20000000-0000-4000-8000-000000000001',
    'due_date', '2099-01-20',
    'status', 'pending',
    'amount', 35000,
    'created_at', '2099-01-01T16:00:00Z',
    'updated_at', '2099-01-01T16:00:00Z',
    'deleted_at', null
  )
);

do $$
begin
  if not exists (
    select 1 from public.incomes
    where id = '20000000-0000-4000-8000-000000000011'
      and status = 'received'
      and affects_balance
      and balance_effective_at = '2099-01-02T12:00:00Z'
  ) then
    raise exception 'legacy_income_compatibility_failed';
  end if;

  if not exists (
    select 1 from public.expenses
    where id = '20000000-0000-4000-8000-000000000021'
      and affects_balance
      and balance_effective_at = '2099-01-03T12:00:00Z'
  ) then
    raise exception 'legacy_expense_compatibility_failed';
  end if;

  if not exists (
    select 1 from public.recurring_payment_occurrences
    where id = '20000000-0000-4000-8000-000000000031'
      and amount = 34500
  ) then
    raise exception 'legacy_occurrence_compatibility_failed';
  end if;

  if not exists (
    select 1 from public.incomes
    where id = '20000000-0000-4000-8000-000000000041'
      and status = 'expected'
      and affects_balance
      and balance_effective_at is null
  ) then
    raise exception 'expected_income_payload_failed';
  end if;

  if not exists (
    select 1 from public.incomes
    where id = '20000000-0000-4000-8000-000000000051'
      and status = 'received'
      and not affects_balance
      and balance_effective_at = '2099-01-05T08:00:00Z'
  ) then
    raise exception 'received_income_payload_failed';
  end if;

  if not exists (
    select 1 from public.expenses
    where id = '20000000-0000-4000-8000-000000000061'
      and not affects_balance
      and balance_effective_at = '2099-01-07T08:00:00Z'
  ) then
    raise exception 'expense_v2_payload_failed';
  end if;

  if not exists (
    select 1 from public.recurring_payment_occurrences
    where id = '20000000-0000-4000-8000-000000000071'
      and amount = 35000
  ) then
    raise exception 'occurrence_v2_payload_failed';
  end if;

  begin
    perform public.apply_sync_operation(
      '20000000-0000-4000-8000-000000000080',
      'recurringPaymentOccurrence',
      '20000000-0000-4000-8000-000000000081',
      'create',
      jsonb_build_object(
        'id', '20000000-0000-4000-8000-000000000081',
        'user_id', current_setting('test.user_a')::uuid,
        'recurring_payment_id', '20000000-0000-4000-8000-000000000099',
        'period_id', '20000000-0000-4000-8000-000000000001',
        'due_date', '2099-01-25',
        'status', 'pending',
        'created_at', '2099-01-01T17:00:00Z',
        'updated_at', '2099-01-01T17:00:00Z',
        'deleted_at', null
      )
    );
    raise exception 'invalid_legacy_occurrence_was_accepted';
  exception when check_violation then
    null;
  end;
end;
$$;

reset role;
rollback;
