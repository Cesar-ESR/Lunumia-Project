-- Provision ordinary, user-owned starter expense categories exactly once.
-- The existing protected "Sin categoría" record remains a separate concern.

create or replace function private.provision_default_expense_categories(
  p_user_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  inserted_count integer;
begin
  if p_user_id is null then
    raise exception 'default_category_owner_required' using errcode = '22004';
  end if;

  -- Any active user category means the owner has already made a category
  -- choice. Do not add or repair individual defaults after that point.
  if exists (
    select 1
    from public.categories as category
    where category.user_id = p_user_id
      and category.deleted_at is null
      and category.is_system = false
  ) then
    return 0;
  end if;

  insert into public.categories (
    id,
    user_id,
    name,
    normalized_name,
    color,
    icon,
    is_system
  )
  select
    pg_catalog.gen_random_uuid(),
    p_user_id,
    template.name,
    template.normalized_name,
    '#2F6FED',
    null,
    false
  from (
    values
      ('Alimentación', 'alimentación'),
      ('Transporte', 'transporte'),
      ('Vivienda', 'vivienda'),
      ('Servicios básicos', 'servicios básicos'),
      ('Salud', 'salud'),
      ('Entretenimiento', 'entretenimiento'),
      ('Compras personales', 'compras personales'),
      ('Educación', 'educación'),
      ('Otros', 'otros')
  ) as template(name, normalized_name)
  where not exists (
    select 1
    from public.categories as history
    where history.user_id = p_user_id
      and history.normalized_name = template.normalized_name
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

revoke all on function private.provision_default_expense_categories(uuid)
  from public, anon, authenticated, service_role;

comment on function private.provision_default_expense_categories(uuid) is
  'Creates the nine ordinary starter expense categories only for an owner with no active non-system categories; historical matching tombstones are never recreated.';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = pg_catalog.now();

  -- The same function also handles profile updates. Provisioning belongs only
  -- to the authoritative auth.users INSERT path, never login/profile refresh.
  if tg_op = 'INSERT' then
    perform private.provision_default_expense_categories(new.id);
  end if;

  return new;
end;
$function$;

revoke all on function private.handle_new_user()
  from public, anon, authenticated, service_role;

-- Existing-user backfill: the helper skips every owner with at least one
-- active ordinary category and preserves matching deleted/tombstoned defaults.
do $backfill$
declare
  existing_user record;
begin
  for existing_user in
    select users.id
    from auth.users as users
    order by users.id
  loop
    perform private.provision_default_expense_categories(existing_user.id);
  end loop;
end;
$backfill$;
