export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  public: {
    Tables: {
      balance_anchors: {
        Row: {
          amount: number
          captured_at: string
          created_at: string
          deleted_at: string | null
          id: string
          ledger_cutoff_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          captured_at: string
          created_at?: string
          deleted_at?: string | null
          id: string
          ledger_cutoff_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          captured_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ledger_cutoff_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          is_system: boolean
          name: string
          normalized_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id: string
          is_system?: boolean
          name: string
          normalized_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          normalized_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      category_budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          deleted_at: string | null
          id: string
          period_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          deleted_at?: string | null
          id: string
          period_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          period_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'category_budgets_category_fk'
            columns: ['user_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['user_id', 'id']
          },
          {
            foreignKeyName: 'category_budgets_period_fk'
            columns: ['user_id', 'period_id']
            isOneToOne: false
            referencedRelation: 'periods'
            referencedColumns: ['user_id', 'id']
          },
        ]
      }
      expenses: {
        Row: {
          affects_balance: boolean
          amount: number
          balance_effective_at: string
          category_id: string
          created_at: string
          date: string
          deleted_at: string | null
          description: string
          id: string
          period_id: string
          recurring_occurrence_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affects_balance: boolean
          amount: number
          balance_effective_at: string
          category_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          description: string
          id: string
          period_id: string
          recurring_occurrence_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affects_balance?: boolean
          amount?: number
          balance_effective_at?: string
          category_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string
          id?: string
          period_id?: string
          recurring_occurrence_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_category_fk'
            columns: ['user_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['user_id', 'id']
          },
          {
            foreignKeyName: 'expenses_occurrence_fk'
            columns: ['user_id', 'recurring_occurrence_id']
            isOneToOne: false
            referencedRelation: 'recurring_payment_occurrences'
            referencedColumns: ['user_id', 'id']
          },
          {
            foreignKeyName: 'expenses_period_fk'
            columns: ['user_id', 'period_id']
            isOneToOne: false
            referencedRelation: 'periods'
            referencedColumns: ['user_id', 'id']
          },
        ]
      }
      incomes: {
        Row: {
          affects_balance: boolean
          amount: number
          balance_effective_at: string | null
          created_at: string
          date: string
          deleted_at: string | null
          description: string
          id: string
          period_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affects_balance: boolean
          amount: number
          balance_effective_at?: string | null
          created_at?: string
          date: string
          deleted_at?: string | null
          description: string
          id: string
          period_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affects_balance?: boolean
          amount?: number
          balance_effective_at?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string
          id?: string
          period_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'incomes_period_fk'
            columns: ['user_id', 'period_id']
            isOneToOne: false
            referencedRelation: 'periods'
            referencedColumns: ['user_id', 'id']
          },
        ]
      }
      periods: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          start_date: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id: string
          start_date: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          start_date?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_operations: {
        Row: {
          operation_id: string
          operation_type: string
          processed_at: string
          user_id: string
        }
        Insert: {
          operation_id: string
          operation_type: string
          processed_at?: string
          user_id: string
        }
        Update: {
          operation_id?: string
          operation_type?: string
          processed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_payment_occurrences: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          due_date: string
          id: string
          period_id: string
          recurring_payment_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          due_date: string
          id: string
          period_id: string
          recurring_payment_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          period_id?: string
          recurring_payment_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recurring_occurrences_payment_fk'
            columns: ['user_id', 'recurring_payment_id']
            isOneToOne: false
            referencedRelation: 'recurring_payments'
            referencedColumns: ['user_id', 'id']
          },
          {
            foreignKeyName: 'recurring_occurrences_period_fk'
            columns: ['user_id', 'period_id']
            isOneToOne: false
            referencedRelation: 'periods'
            referencedColumns: ['user_id', 'id']
          },
        ]
      }
      recurring_payments: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          deleted_at: string | null
          due_date: string
          end_date: string | null
          frequency: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          deleted_at?: string | null
          due_date: string
          end_date?: string | null
          frequency: string
          id: string
          name: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          end_date?: string | null
          frequency?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recurring_payments_category_fk'
            columns: ['user_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['user_id', 'id']
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          active_period_id: string | null
          created_at: string
          currency: string
          id: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_period_id?: string | null
          created_at?: string
          currency?: string
          id: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_period_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_settings_period_fk'
            columns: ['user_id', 'active_period_id']
            isOneToOne: false
            referencedRelation: 'periods'
            referencedColumns: ['user_id', 'id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_sync_operation: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_operation_id: string
          p_operation_type: string
          p_payload: Json
        }
        Returns: Json
      }
      consume_rate_limit: {
        Args: { p_scope: string }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      delete_user_data: { Args: { target_user_id: string }; Returns: undefined }
      fetch_sync_changes: {
        Args: {
          p_entity_id?: string
          p_entity_type: string
          p_limit?: number
          p_updated_at?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
