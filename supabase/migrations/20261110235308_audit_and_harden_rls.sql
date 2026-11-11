-- Migration: Complete Row Level Security (RLS) Audit and Hardening
-- Description: Ensures RLS is enabled on all public tables and enforces strict, performant,
--              and idempotent access control policies following Supabase & PostgreSQL best practices.

-- ============================================================================
-- 1. ENABLE ROW LEVEL SECURITY (RLS) FOR ALL PUBLIC TABLES
-- ============================================================================
alter table public.user_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.periods enable row level security;
alter table public.categories enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.category_budgets enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.recurring_payment_occurrences enable row level security;
alter table public.processed_operations enable row level security;
alter table public.balance_anchors enable row level security;

-- ============================================================================
-- 2. DROP EXISTING POLICIES (TO ENSURE CLEAN, IDEMPOTENT APPLICATION)
-- ============================================================================

-- public.user_profiles
drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_insert_own on public.user_profiles;
drop policy if exists user_profiles_update_own on public.user_profiles;
drop policy if exists user_profiles_delete_own on public.user_profiles;

-- public.user_settings
drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
drop policy if exists user_settings_delete_own on public.user_settings;

-- public.periods
drop policy if exists periods_select_own on public.periods;
drop policy if exists periods_insert_own on public.periods;
drop policy if exists periods_update_own on public.periods;
drop policy if exists periods_delete_own on public.periods;

-- public.categories
drop policy if exists categories_select_own on public.categories;
drop policy if exists categories_insert_own on public.categories;
drop policy if exists categories_update_own on public.categories;
drop policy if exists categories_delete_own on public.categories;

-- public.incomes
drop policy if exists incomes_select_own on public.incomes;
drop policy if exists incomes_insert_own on public.incomes;
drop policy if exists incomes_update_own on public.incomes;
drop policy if exists incomes_delete_own on public.incomes;

-- public.expenses
drop policy if exists expenses_select_own on public.expenses;
drop policy if exists expenses_insert_own on public.expenses;
drop policy if exists expenses_update_own on public.expenses;
drop policy if exists expenses_delete_own on public.expenses;

-- public.category_budgets
drop policy if exists category_budgets_select_own on public.category_budgets;
drop policy if exists category_budgets_insert_own on public.category_budgets;
drop policy if exists category_budgets_update_own on public.category_budgets;
drop policy if exists category_budgets_delete_own on public.category_budgets;

-- public.recurring_payments
drop policy if exists recurring_payments_select_own on public.recurring_payments;
drop policy if exists recurring_payments_insert_own on public.recurring_payments;
drop policy if exists recurring_payments_update_own on public.recurring_payments;
drop policy if exists recurring_payments_delete_own on public.recurring_payments;

-- public.recurring_payment_occurrences
drop policy if exists recurring_payment_occurrences_select_own on public.recurring_payment_occurrences;
drop policy if exists recurring_payment_occurrences_insert_own on public.recurring_payment_occurrences;
drop policy if exists recurring_payment_occurrences_update_own on public.recurring_payment_occurrences;
drop policy if exists recurring_payment_occurrences_delete_own on public.recurring_payment_occurrences;

-- public.processed_operations
drop policy if exists processed_operations_select_own on public.processed_operations;
drop policy if exists processed_operations_insert_own on public.processed_operations;
drop policy if exists processed_operations_update_own on public.processed_operations;
drop policy if exists processed_operations_delete_own on public.processed_operations;

-- public.balance_anchors
drop policy if exists balance_anchors_select_own on public.balance_anchors;
drop policy if exists balance_anchors_insert_own on public.balance_anchors;
drop policy if exists balance_anchors_update_own on public.balance_anchors;
drop policy if exists balance_anchors_delete_own on public.balance_anchors;

-- ============================================================================
-- 3. CREATE STANDARDIZED ROW LEVEL SECURITY POLICIES
--
-- Security standards applied:
--  - Scoped explicitly to `TO authenticated` role.
--  - Wrapped evaluation in `(select auth.uid())` to prevent per-row re-evaluation and maximize plan caching.
--  - Explicit UPDATE policies contain both USING (filtering existing row) and WITH CHECK (validating mutation payload).
--  - Immutability where appropriate (e.g. processed_operations: append-only).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: public.user_profiles
-- Key: id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy user_profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_profiles_delete_own on public.user_profiles
  for delete to authenticated
  using (id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.user_settings
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_settings_insert_own on public.user_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_settings_delete_own on public.user_settings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.periods
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy periods_select_own on public.periods
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy periods_insert_own on public.periods
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy periods_update_own on public.periods
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy periods_delete_own on public.periods
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.categories
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy categories_select_own on public.categories
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy categories_insert_own on public.categories
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy categories_update_own on public.categories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy categories_delete_own on public.categories
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.incomes
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy incomes_select_own on public.incomes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy incomes_insert_own on public.incomes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy incomes_update_own on public.incomes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy incomes_delete_own on public.incomes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.expenses
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy expenses_select_own on public.expenses
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy expenses_insert_own on public.expenses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy expenses_update_own on public.expenses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy expenses_delete_own on public.expenses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.category_budgets
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy category_budgets_select_own on public.category_budgets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy category_budgets_insert_own on public.category_budgets
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy category_budgets_update_own on public.category_budgets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy category_budgets_delete_own on public.category_budgets
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.recurring_payments
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy recurring_payments_select_own on public.recurring_payments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy recurring_payments_insert_own on public.recurring_payments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy recurring_payments_update_own on public.recurring_payments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recurring_payments_delete_own on public.recurring_payments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.recurring_payment_occurrences
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
create policy recurring_payment_occurrences_select_own on public.recurring_payment_occurrences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy recurring_payment_occurrences_insert_own on public.recurring_payment_occurrences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy recurring_payment_occurrences_update_own on public.recurring_payment_occurrences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recurring_payment_occurrences_delete_own on public.recurring_payment_occurrences
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.processed_operations
-- Key: user_id (references auth.users.id)
-- Purpose: Sync audit and deduplication log. Append/Read-only for users.
-- ----------------------------------------------------------------------------
create policy processed_operations_select_own on public.processed_operations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy processed_operations_insert_own on public.processed_operations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Table: public.balance_anchors
-- Key: user_id (references auth.users.id)
-- ----------------------------------------------------------------------------
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

-- ============================================================================
-- 4. PRIVILEGE HARDENING (DEFENSE IN DEPTH)
-- ============================================================================
revoke all on table
  public.user_profiles,
  public.user_settings,
  public.periods,
  public.categories,
  public.incomes,
  public.expenses,
  public.category_budgets,
  public.recurring_payments,
  public.recurring_payment_occurrences,
  public.processed_operations,
  public.balance_anchors
from public, anon;

grant select, insert, update, delete on table
  public.user_profiles,
  public.user_settings,
  public.periods,
  public.categories,
  public.incomes,
  public.expenses,
  public.category_budgets,
  public.recurring_payments,
  public.recurring_payment_occurrences,
  public.balance_anchors
to authenticated;

grant select, insert on table
  public.processed_operations
to authenticated;
