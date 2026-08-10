/**
 * Tipos bootstrap mantenidos junto a la migración inicial.
 * Regenerar después de aplicar el esquema real con:
 * `supabase gen types typescript --local > src/infrastructure/remote/database.types.ts`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type TableDefinition<Row, Insert, Update> = {
  Row: Row & Record<string, unknown>
  Insert: Insert & Record<string, unknown>
  Update: Update & Record<string, unknown>
  Relationships: []
}

interface SyncColumns {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type SyncInsert = {
  id: string
  user_id: string
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

type SyncUpdate = Partial<SyncInsert>

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  public: {
    Tables: {
      user_profiles: TableDefinition<
        {
          id: string
          email: string | null
          display_name: string
          created_at: string
          updated_at: string
        },
        {
          id: string
          email?: string | null
          display_name?: string
          created_at?: string
          updated_at?: string
        },
        {
          email?: string | null
          display_name?: string
          updated_at?: string
        }
      >
      user_settings: TableDefinition<
        {
          id: string
          user_id: string
          active_period_id: string | null
          currency: string
          theme: string
          created_at: string
          updated_at: string
        },
        {
          id: string
          user_id: string
          active_period_id?: string | null
          currency?: string
          theme?: string
          created_at?: string
          updated_at?: string
        },
        {
          active_period_id?: string | null
          currency?: string
          theme?: string
          updated_at?: string
        }
      >
      periods: TableDefinition<
        SyncColumns & { type: string; start_date: string; end_date: string },
        SyncInsert & { type: string; start_date: string; end_date: string },
        SyncUpdate & { type?: string; start_date?: string; end_date?: string }
      >
      incomes: TableDefinition<
        SyncColumns & {
          period_id: string
          amount: number
          description: string
          date: string
        },
        SyncInsert & {
          period_id: string
          amount: number
          description: string
          date: string
        },
        SyncUpdate & {
          period_id?: string
          amount?: number
          description?: string
          date?: string
        }
      >
      expenses: TableDefinition<
        SyncColumns & {
          period_id: string
          category_id: string
          amount: number
          description: string
          date: string
          recurring_occurrence_id: string | null
        },
        SyncInsert & {
          period_id: string
          category_id: string
          amount: number
          description: string
          date: string
          recurring_occurrence_id?: string | null
        },
        SyncUpdate & {
          period_id?: string
          category_id?: string
          amount?: number
          description?: string
          date?: string
          recurring_occurrence_id?: string | null
        }
      >
      categories: TableDefinition<
        SyncColumns & {
          name: string
          normalized_name: string
          color: string
          icon: string | null
          is_system: boolean
        },
        SyncInsert & {
          name: string
          normalized_name: string
          color: string
          icon?: string | null
          is_system?: boolean
        },
        SyncUpdate & {
          name?: string
          normalized_name?: string
          color?: string
          icon?: string | null
          is_system?: boolean
        }
      >
      category_budgets: TableDefinition<
        SyncColumns & {
          period_id: string
          category_id: string
          amount: number
        },
        SyncInsert & { period_id: string; category_id: string; amount: number },
        SyncUpdate & {
          period_id?: string
          category_id?: string
          amount?: number
        }
      >
      recurring_payments: TableDefinition<
        SyncColumns & {
          name: string
          amount: number
          frequency: string
          due_date: string
          end_date: string | null
          category_id: string
          status: string
        },
        SyncInsert & {
          name: string
          amount: number
          frequency: string
          due_date: string
          end_date?: string | null
          category_id: string
          status: string
        },
        SyncUpdate & {
          name?: string
          amount?: number
          frequency?: string
          due_date?: string
          end_date?: string | null
          category_id?: string
          status?: string
        }
      >
      recurring_payment_occurrences: TableDefinition<
        SyncColumns & {
          recurring_payment_id: string
          period_id: string
          due_date: string
          status: string
        },
        SyncInsert & {
          recurring_payment_id: string
          period_id: string
          due_date: string
          status: string
        },
        SyncUpdate & {
          recurring_payment_id?: string
          period_id?: string
          due_date?: string
          status?: string
        }
      >
      processed_operations: TableDefinition<
        {
          operation_id: string
          user_id: string
          operation_type: string
          processed_at: string
        },
        {
          operation_id: string
          user_id: string
          operation_type: string
          processed_at?: string
        },
        never
      >
    }
    Views: Record<never, never>
    Functions: {
      delete_user_data: { Args: { target_user_id: string }; Returns: undefined }
      apply_sync_operation: {
        Args: {
          p_operation_id: string
          p_entity_type: string
          p_entity_id: string
          p_operation_type: string
          p_payload: Json
        }
        Returns: Json
      }
      fetch_sync_changes: {
        Args: {
          p_entity_type: string
          p_updated_at: string | null
          p_entity_id: string | null
          p_limit: number
        }
        Returns: Json
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
