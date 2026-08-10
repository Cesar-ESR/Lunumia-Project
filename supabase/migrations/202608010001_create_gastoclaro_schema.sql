create extension if not exists btree_gist with schema extensions;

create schema private;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_profiles_email_unique
  on public.user_profiles (lower(email))
  where email is not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
      updated_at = now();
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_profile_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function private.handle_new_user();

insert into public.user_profiles (id, email, display_name)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'display_name', '')
from auth.users as users
on conflict (id) do nothing;

create table public.periods (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('monthly', 'biweekly')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint periods_valid_range check (start_date <= end_date),
  constraint periods_user_id_id_unique unique (user_id, id)
);

alter table public.periods add constraint periods_no_overlap_per_user
  exclude using gist (
    user_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (deleted_at is null);

create table public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color text not null,
  icon text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint categories_normalized_name_check
    check (normalized_name = lower(btrim(name))),
  constraint categories_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint categories_user_id_id_unique unique (user_id, id)
);

create unique index categories_active_name_unique
  on public.categories (user_id, normalized_name)
  where deleted_at is null;

create table public.incomes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null,
  amount bigint not null check (amount > 0),
  description text not null,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint incomes_user_id_id_unique unique (user_id, id),
  constraint incomes_period_fk foreign key (user_id, period_id)
    references public.periods(user_id, id)
);

create table public.recurring_payments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount bigint not null check (amount > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  due_date date not null,
  end_date date,
  category_id uuid not null,
  status text not null check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint recurring_payments_end_date_check
    check (end_date is null or due_date <= end_date),
  constraint recurring_payments_user_id_id_unique unique (user_id, id),
  constraint recurring_payments_category_fk foreign key (user_id, category_id)
    references public.categories(user_id, id)
);

create table public.recurring_payment_occurrences (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_payment_id uuid not null,
  period_id uuid not null,
  due_date date not null,
  status text not null check (status in ('pending', 'paid', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint recurring_occurrences_user_id_id_unique unique (user_id, id),
  constraint recurring_occurrences_payment_fk foreign key (user_id, recurring_payment_id)
    references public.recurring_payments(user_id, id),
  constraint recurring_occurrences_period_fk foreign key (user_id, period_id)
    references public.periods(user_id, id)
);

comment on column public.recurring_payment_occurrences.status is
  'El servicio de aplicación debe cambiar a paid en la misma transacción que crea exactamente un gasto activo vinculado por expenses.recurring_occurrence_id. El índice expenses_active_occurrence_unique impide más de uno.';

create unique index recurring_occurrences_active_unique
  on public.recurring_payment_occurrences (user_id, recurring_payment_id, due_date)
  where deleted_at is null;

create table public.expenses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null,
  category_id uuid not null,
  amount bigint not null check (amount > 0),
  description text not null,
  date date not null,
  recurring_occurrence_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint expenses_user_id_id_unique unique (user_id, id),
  constraint expenses_period_fk foreign key (user_id, period_id)
    references public.periods(user_id, id),
  constraint expenses_category_fk foreign key (user_id, category_id)
    references public.categories(user_id, id),
  constraint expenses_occurrence_fk foreign key (user_id, recurring_occurrence_id)
    references public.recurring_payment_occurrences(user_id, id)
    on delete set null (recurring_occurrence_id)
);

create unique index expenses_active_occurrence_unique
  on public.expenses (recurring_occurrence_id)
  where recurring_occurrence_id is not null and deleted_at is null;

create table public.category_budgets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null,
  category_id uuid not null,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint category_budgets_user_id_id_unique unique (user_id, id),
  constraint category_budgets_period_fk foreign key (user_id, period_id)
    references public.periods(user_id, id),
  constraint category_budgets_category_fk foreign key (user_id, category_id)
    references public.categories(user_id, id)
);

create unique index category_budgets_active_unique
  on public.category_budgets (user_id, period_id, category_id)
  where deleted_at is null;

create table public.user_settings (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  active_period_id uuid,
  currency text not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_period_fk foreign key (user_id, active_period_id)
    references public.periods(user_id, id)
);

create table public.processed_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null,
  processed_at timestamptz not null default now()
);

create index periods_user_start_idx on public.periods (user_id, start_date);
create index periods_user_end_idx on public.periods (user_id, end_date);
create index periods_sync_cursor_idx on public.periods (user_id, updated_at, id);
create index incomes_user_period_idx on public.incomes (user_id, period_id);
create index incomes_user_date_idx on public.incomes (user_id, date);
create index incomes_sync_cursor_idx on public.incomes (user_id, updated_at, id);
create index expenses_user_period_idx on public.expenses (user_id, period_id);
create index expenses_user_category_idx on public.expenses (user_id, category_id);
create index expenses_user_date_idx on public.expenses (user_id, date);
create index expenses_sync_cursor_idx on public.expenses (user_id, updated_at, id);
create index categories_sync_cursor_idx on public.categories (user_id, updated_at, id);
create index category_budgets_user_period_idx on public.category_budgets (user_id, period_id);
create index category_budgets_sync_cursor_idx on public.category_budgets (user_id, updated_at, id);
create index recurring_payments_user_status_idx on public.recurring_payments (user_id, status);
create index recurring_payments_user_category_idx on public.recurring_payments (user_id, category_id);
create index recurring_payments_sync_cursor_idx on public.recurring_payments (user_id, updated_at, id);
create index recurring_occurrences_user_period_idx on public.recurring_payment_occurrences (user_id, period_id);
create index recurring_occurrences_user_payment_idx on public.recurring_payment_occurrences (user_id, recurring_payment_id);
create index recurring_occurrences_sync_cursor_idx on public.recurring_payment_occurrences (user_id, updated_at, id);
create index expenses_user_occurrence_idx on public.expenses (user_id, recurring_occurrence_id);
create index category_budgets_user_category_idx on public.category_budgets (user_id, category_id);
create index processed_operations_user_idx on public.processed_operations (user_id, operation_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;

create trigger set_user_profiles_updated_at before update on public.user_profiles
  for each row execute function private.set_updated_at();
create trigger set_periods_updated_at before update on public.periods
  for each row execute function private.set_updated_at();
create trigger set_categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger set_incomes_updated_at before update on public.incomes
  for each row execute function private.set_updated_at();
create trigger set_recurring_payments_updated_at before update on public.recurring_payments
  for each row execute function private.set_updated_at();
create trigger set_recurring_occurrences_updated_at before update on public.recurring_payment_occurrences
  for each row execute function private.set_updated_at();
create trigger set_expenses_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();
create trigger set_category_budgets_updated_at before update on public.category_budgets
  for each row execute function private.set_updated_at();
create trigger set_user_settings_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.periods enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.categories enable row level security;
alter table public.category_budgets enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.recurring_payment_occurrences enable row level security;
alter table public.processed_operations enable row level security;

create policy user_profiles_select_own on public.user_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy user_profiles_delete_own on public.user_profiles
  for delete to authenticated using (id = (select auth.uid()));

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'user_settings', 'periods', 'incomes', 'expenses', 'categories',
    'category_budgets', 'recurring_payments',
    'recurring_payment_occurrences'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      protected_table || '_select_own', protected_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      protected_table || '_insert_own', protected_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      protected_table || '_update_own', protected_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      protected_table || '_delete_own', protected_table
    );
  end loop;
end;
$$;

create policy processed_operations_select_own on public.processed_operations
  for select to authenticated using (user_id = (select auth.uid()));
create policy processed_operations_insert_own on public.processed_operations
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on table
  public.user_profiles,
  public.user_settings,
  public.periods,
  public.incomes,
  public.expenses,
  public.categories,
  public.category_budgets,
  public.recurring_payments,
  public.recurring_payment_occurrences,
  public.processed_operations
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.user_profiles,
  public.user_settings,
  public.periods,
  public.incomes,
  public.expenses,
  public.categories,
  public.category_budgets,
  public.recurring_payments,
  public.recurring_payment_occurrences
to authenticated;

grant select, insert on table public.processed_operations to authenticated;

create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.processed_operations where user_id = target_user_id;
  delete from public.user_settings where user_id = target_user_id;
  delete from public.expenses where user_id = target_user_id;
  delete from public.recurring_payment_occurrences where user_id = target_user_id;
  delete from public.category_budgets where user_id = target_user_id;
  delete from public.incomes where user_id = target_user_id;
  delete from public.recurring_payments where user_id = target_user_id;
  delete from public.categories where user_id = target_user_id;
  delete from public.periods where user_id = target_user_id;
  delete from public.user_profiles where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
