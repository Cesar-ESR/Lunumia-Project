// Static contract audit only: this test must never apply the migration.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const previous = readFileSync(
  'supabase/migrations/20260816072211_add_balance_anchor_sync_rpc.sql',
  'utf8',
).replace(/\r\n/g, '\n')
const migration = readFileSync(
  'supabase/migrations/20260908190246_add_expense_source.sql',
  'utf8',
).replace(/\r\n/g, '\n')

describe('expense source migration contract', () => {
  it('adds only nullable TEXT plus CHECK without backfill or default', () => {
    const ddl = migration
      .slice(0, migration.indexOf('create or replace function'))
      .replace(/^--.*$/gm, '')
    expect(ddl.trim()).toBe(
      "alter table public.expenses\n  add column source text null\n    constraint expenses_source_check\n    check (source is null or source in ('manual', 'receipt'));",
    )
  })
  it('preserves RPC auth, conflicts, deletes and grants; only both expense update clauses change', () => {
    const original = previous
      .slice(
        previous.indexOf(
          'create or replace function public.apply_sync_operation',
        ),
        previous.indexOf('revoke all on function public.apply_sync_operation'),
      )
      .trim()
    const updated = migration
      .slice(migration.indexOf('create or replace function'))
      .trim()
    expect(
      updated.match(/source = coalesce\(expenses.source, excluded.source\)/g),
    ).toHaveLength(2)
    expect(
      updated
        .replace(
          '      source = coalesce(expenses.source, excluded.source),\n',
          '',
        )
        .replace('source = coalesce(expenses.source, excluded.source), ', ''),
    ).toBe(original)
    expect(previous).toContain('to_jsonb(sync_row)')
    expect(migration).not.toMatch(/\b(?:grant|revoke)\b/i)
    expect(previous).toContain('from (select * from public.%I')
  })
})
