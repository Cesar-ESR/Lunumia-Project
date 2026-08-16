-- D6 smoke tests for balance-anchor sync RPCs.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v user_a='<uuid-a>' -v user_b='<uuid-b>' -f supabase/tests/lunumia-2-sync-protocol-verification.sql

begin;
select set_config('test.user_a', :'user_a', true);
select set_config('test.user_b', :'user_b', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);

select public.apply_sync_operation(
  '60000000-0000-4000-8000-000000000001',
  'balanceAnchor',
  '60000000-0000-4000-8000-000000000011',
  'create',
  jsonb_build_object(
    'id', '60000000-0000-4000-8000-000000000011',
    'user_id', :'user_a',
    'amount', -2500,
    'captured_at', '2099-01-01T10:00:00Z',
    'ledger_cutoff_at', '2099-01-01T09:59:59Z',
    'created_at', '2099-01-01T10:00:00Z',
    'updated_at', '2099-01-01T12:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '60000000-0000-4000-8000-000000000002',
  'balanceAnchor',
  '60000000-0000-4000-8000-000000000012',
  'create',
  jsonb_build_object(
    'id', '60000000-0000-4000-8000-000000000012',
    'user_id', :'user_a',
    'amount', 0,
    'captured_at', '2099-01-01T11:00:00Z',
    'ledger_cutoff_at', '2099-01-01T10:59:59Z',
    'created_at', '2099-01-01T11:00:00Z',
    'updated_at', '2099-01-01T12:00:00Z',
    'deleted_at', null
  )
);

select public.apply_sync_operation(
  '60000000-0000-4000-8000-000000000003',
  'balanceAnchor',
  '60000000-0000-4000-8000-000000000013',
  'create',
  jsonb_build_object(
    'id', '60000000-0000-4000-8000-000000000013',
    'user_id', :'user_a',
    'amount', 100000,
    'captured_at', '2099-01-01T12:00:00Z',
    'ledger_cutoff_at', '2099-01-01T11:59:59Z',
    'created_at', '2099-01-01T12:00:00Z',
    'updated_at', '2099-01-01T12:00:00Z',
    'deleted_at', null
  )
);

do $$
declare
  v_result jsonb;
  v_page_one jsonb;
  v_page_two jsonb;
  v_last jsonb;
begin
  v_result := public.apply_sync_operation(
    '60000000-0000-4000-8000-000000000001',
    'balanceAnchor',
    '60000000-0000-4000-8000-000000000011',
    'create',
    jsonb_build_object(
      'id', '60000000-0000-4000-8000-000000000011',
      'user_id', current_setting('test.user_a')::uuid,
      'amount', -2500,
      'captured_at', '2099-01-01T10:00:00Z',
      'ledger_cutoff_at', '2099-01-01T09:59:59Z',
      'created_at', '2099-01-01T10:00:00Z',
      'updated_at', '2099-01-01T12:00:00Z',
      'deleted_at', null
    )
  );
  if v_result ->> 'status' <> 'already_processed' then
    raise exception 'balance_anchor_idempotency_failed';
  end if;

  v_result := public.apply_sync_operation(
    '60000000-0000-4000-8000-000000000004',
    'balanceAnchor',
    '60000000-0000-4000-8000-000000000013',
    'update',
    jsonb_build_object(
      'id', '60000000-0000-4000-8000-000000000013',
      'user_id', current_setting('test.user_a')::uuid,
      'amount', 999999,
      'captured_at', '2098-01-01T12:00:00Z',
      'ledger_cutoff_at', '2098-01-01T11:59:59Z',
      'created_at', '2098-01-01T12:00:00Z',
      'updated_at', '2098-01-01T12:00:00Z',
      'deleted_at', null
    )
  );
  if v_result ->> 'status' <> 'remote_wins' then
    raise exception 'balance_anchor_lww_failed';
  end if;

  v_page_one := public.fetch_sync_changes('balanceAnchor', null, null, 2);
  if jsonb_array_length(v_page_one) <> 2 then
    raise exception 'balance_anchor_first_page_failed';
  end if;
  v_last := v_page_one -> 1;
  v_page_two := public.fetch_sync_changes(
    'balanceAnchor',
    (v_last ->> 'updated_at')::timestamptz,
    (v_last ->> 'id')::uuid,
    2
  );
  if jsonb_array_length(v_page_two) <> 1 then
    raise exception 'balance_anchor_cursor_failed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_page_one || v_page_two) row_value
    where not (
      row_value ? 'amount'
      and row_value ? 'captured_at'
      and row_value ? 'ledger_cutoff_at'
      and row_value ? 'updated_at'
    )
  ) then
    raise exception 'balance_anchor_download_fields_failed';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    current_setting('test.user_b'),
    true
  );
  if exists (
    select 1
    from jsonb_array_elements(
      public.fetch_sync_changes('balanceAnchor', null, null, 100)
    ) row_value
    where row_value ->> 'id' in (
      '60000000-0000-4000-8000-000000000011',
      '60000000-0000-4000-8000-000000000012',
      '60000000-0000-4000-8000-000000000013'
    )
  ) then
    raise exception 'balance_anchor_cross_owner_leak';
  end if;
end;
$$;

reset role;
rollback;
