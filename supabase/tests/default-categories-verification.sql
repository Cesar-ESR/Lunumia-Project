-- Transactional verification for DEFAULT-CATEGORIES-01.
-- Run against a local Supabase database after all migrations.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/default-categories-verification.sql

begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'default-categories-a@example.invalid',
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'default-categories-b@example.invalid',
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'default-categories-tombstone@example.invalid',
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  );

do $assert_new_users$
begin
  if (
    select count(*)
    from public.categories
    where user_id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )
      and deleted_at is null
      and is_system = false
  ) <> 18 then
    raise exception 'new_users_did_not_receive_independent_starter_sets';
  end if;

  if exists (
    (
      select category.name
      from public.categories as category
      where category.user_id = '30000000-0000-4000-8000-000000000001'
        and category.deleted_at is null
        and category.is_system = false
    )
    except
    values
      ('Alimentación'),
      ('Transporte'),
      ('Vivienda'),
      ('Servicios básicos'),
      ('Salud'),
      ('Entretenimiento'),
      ('Compras personales'),
      ('Educación'),
      ('Otros')
  ) or exists (
    (values
      ('Alimentación'),
      ('Transporte'),
      ('Vivienda'),
      ('Servicios básicos'),
      ('Salud'),
      ('Entretenimiento'),
      ('Compras personales'),
      ('Educación'),
      ('Otros'))
    except
    select category.name
    from public.categories as category
    where category.user_id = '30000000-0000-4000-8000-000000000001'
      and category.deleted_at is null
      and category.is_system = false
  ) then
    raise exception 'starter_category_labels_are_not_canonical';
  end if;

  if exists (
    select 1
    from public.categories as first_owner
    join public.categories as second_owner
      on second_owner.id = first_owner.id
    where first_owner.user_id = '30000000-0000-4000-8000-000000000001'
      and second_owner.user_id = '30000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'starter_category_ids_are_shared';
  end if;
end;
$assert_new_users$;

do $assert_idempotency$
declare
  inserted_count integer;
begin
  inserted_count := private.provision_default_expense_categories(
    '30000000-0000-4000-8000-000000000001'
  );
  if inserted_count <> 0 then
    raise exception 'second_provisioning_created_duplicates';
  end if;
end;
$assert_idempotency$;

-- Simulate two pre-migration users without invoking the future-user trigger.
alter table auth.users disable trigger on_auth_user_created;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'default-categories-existing@example.invalid',
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'default-categories-empty@example.invalid',
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  );

alter table auth.users enable trigger on_auth_user_created;

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  color,
  icon,
  is_system
)
values (
  '31000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  'Comida',
  'comida',
  '#2F6FED',
  null,
  false
);

do $assert_existing_users$
declare
  existing_inserted integer;
  empty_inserted integer;
begin
  existing_inserted := private.provision_default_expense_categories(
    '30000000-0000-4000-8000-000000000003'
  );
  empty_inserted := private.provision_default_expense_categories(
    '30000000-0000-4000-8000-000000000004'
  );

  if existing_inserted <> 0 or (
    select count(*)
    from public.categories
    where user_id = '30000000-0000-4000-8000-000000000003'
      and deleted_at is null
  ) <> 1 then
    raise exception 'existing_user_categories_were_modified';
  end if;

  if empty_inserted <> 9 or (
    select count(*)
    from public.categories
    where user_id = '30000000-0000-4000-8000-000000000004'
      and deleted_at is null
      and is_system = false
  ) <> 9 then
    raise exception 'empty_existing_user_did_not_receive_starter_set';
  end if;
end;
$assert_existing_users$;

-- Starter rows use the same owner-scoped RLS and ordinary edit/delete behavior.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

update public.categories
set name = 'Supermercado',
    normalized_name = 'supermercado'
where user_id = '30000000-0000-4000-8000-000000000001'
  and normalized_name = 'alimentación'
  and is_system = false;

update public.categories
set deleted_at = pg_catalog.now()
where user_id = '30000000-0000-4000-8000-000000000001'
  and normalized_name = 'transporte'
  and is_system = false;

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  color,
  icon,
  is_system
)
values (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Viajes',
  'viajes',
  '#2F6FED',
  null,
  false
);

insert into public.periods (
  id,
  user_id,
  type,
  start_date,
  end_date
)
values (
  '32000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'monthly',
  '2026-08-01',
  '2026-08-31'
);

insert into public.expenses (
  id,
  user_id,
  period_id,
  category_id,
  amount,
  description,
  date,
  affects_balance,
  balance_effective_at
)
select
  '33000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  category.id,
  12500,
  'Gasto con categoría inicial',
  '2026-08-20',
  true,
  '2026-08-20T12:00:00Z'
from public.categories as category
where category.user_id = '30000000-0000-4000-8000-000000000001'
  and category.normalized_name = 'vivienda'
  and category.deleted_at is null;

do $assert_rls$
declare
  affected integer;
begin
  if (
    select count(*)
    from public.categories
    where user_id = '30000000-0000-4000-8000-000000000002'
  ) <> 0 then
    raise exception 'cross_user_category_read_leak';
  end if;

  update public.categories
  set name = 'No permitido', normalized_name = 'no permitido'
  where user_id = '30000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'cross_user_category_update_leak';
  end if;

  delete from public.categories
  where user_id = '30000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'cross_user_category_delete_leak';
  end if;

  if (
    select count(*)
    from public.expenses
    where id = '33000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'seeded_category_expense_creation_failed';
  end if;
end;
$assert_rls$;

reset role;

do $assert_ordinary_behavior$
declare
  inserted_count integer;
begin
  inserted_count := private.provision_default_expense_categories(
    '30000000-0000-4000-8000-000000000001'
  );

  if inserted_count <> 0
    or exists (
      select 1
      from public.categories
      where user_id = '30000000-0000-4000-8000-000000000001'
        and normalized_name = 'alimentación'
        and deleted_at is null
    )
    or exists (
      select 1
      from public.categories
      where user_id = '30000000-0000-4000-8000-000000000001'
        and normalized_name = 'transporte'
        and deleted_at is null
    )
    or not exists (
      select 1
      from public.categories
      where user_id = '30000000-0000-4000-8000-000000000001'
        and normalized_name = 'supermercado'
        and deleted_at is null
        and is_system = false
    )
    or not exists (
      select 1
      from public.categories
      where user_id = '30000000-0000-4000-8000-000000000001'
        and normalized_name = 'viajes'
        and deleted_at is null
        and is_system = false
    ) then
    raise exception 'starter_categories_do_not_behave_like_ordinary_rows';
  end if;
end;
$assert_ordinary_behavior$;

-- Profile/auth updates must not recreate a starter set after deletion.
update public.categories
set deleted_at = pg_catalog.now()
where user_id = '30000000-0000-4000-8000-000000000005'
  and is_system = false;

update auth.users
set raw_user_meta_data = '{"display_name":"Sin reseed"}'::jsonb
where id = '30000000-0000-4000-8000-000000000005';

do $assert_tombstones$
begin
  if exists (
    select 1
    from public.categories
    where user_id = '30000000-0000-4000-8000-000000000005'
      and deleted_at is null
      and is_system = false
  ) or (
    select count(*)
    from public.categories
    where user_id = '30000000-0000-4000-8000-000000000005'
      and deleted_at is not null
      and is_system = false
  ) <> 9 then
    raise exception 'auth_profile_update_recreated_deleted_defaults';
  end if;
end;
$assert_tombstones$;

rollback;
