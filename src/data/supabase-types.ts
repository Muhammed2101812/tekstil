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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attendance: {
        Row: {
          arrival_time: string | null
          day: string
          early_leave_minutes: number
          employee_id: string
          id: string
          late_minutes: number
          leave_time: string | null
          note: string | null
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          arrival_time?: string | null
          day: string
          early_leave_minutes?: number
          employee_id: string
          id: string
          late_minutes?: number
          leave_time?: string | null
          note?: string | null
          org_id: string
          status: string
          updated_at?: string
        }
        Update: {
          arrival_time?: string | null
          day?: string
          early_leave_minutes?: number
          employee_id?: string
          id?: string
          late_minutes?: number
          leave_time?: string | null
          note?: string | null
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_days: {
        Row: {
          confirmed_at: string
          confirmed_by: string | null
          day: string
          id: string
          org_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string | null
          day: string
          id: string
          org_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string | null
          day?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          diff: Json | null
          id: string
          org_id: string | null
          row_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          diff?: Json | null
          id?: string
          org_id?: string | null
          row_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          diff?: Json | null
          id?: string
          org_id?: string | null
          row_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          date: string
          department_id: string | null
          employee_ids: Json
          end_time: string | null
          id: string
          multiplier: number | null
          org_id: string
          paid: boolean
          scope: string
          start_time: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          date: string
          department_id?: string | null
          employee_ids?: Json
          end_time?: string | null
          id: string
          multiplier?: number | null
          org_id: string
          paid?: boolean
          scope?: string
          start_time?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          date?: string
          department_id?: string | null
          employee_ids?: Json
          end_time?: string | null
          id?: string
          multiplier?: number | null
          org_id?: string
          paid?: boolean
          scope?: string
          start_time?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          created_at: string
          debt_id: string
          employee_id: string
          id: string
          method: string
          note: string | null
          org_id: string
          paid_at: string
          payroll_item_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          debt_id: string
          employee_id: string
          id: string
          method: string
          note?: string | null
          org_id: string
          paid_at: string
          payroll_item_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          debt_id?: string
          employee_id?: string
          id?: string
          method?: string
          note?: string | null
          org_id?: string
          paid_at?: string
          payroll_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number
          client_ref: string
          description: string | null
          employee_id: string
          given_at: string
          id: string
          installments: number
          org_id: string
          start_month: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_ref: string
          description?: string | null
          employee_id: string
          given_at: string
          id: string
          installments?: number
          org_id: string
          start_month: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_ref?: string
          description?: string | null
          employee_id?: string
          given_at?: string
          id?: string
          installments?: number
          org_id?: string
          start_month?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          id: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salaries: {
        Row: {
          amount: number
          created_at: string
          effective_from: string
          employee_id: string
          id: string
          note: string | null
          org_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          effective_from: string
          employee_id: string
          id: string
          note?: string | null
          org_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          effective_from?: string
          employee_id?: string
          id?: string
          note?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          address: string | null
          birth_date: string | null
          created_at: string
          department_id: string | null
          emergency_contact: string | null
          end_date: string | null
          full_name: string
          iban: string | null
          id: string
          notes: string | null
          org_id: string
          phone: string | null
          photo_url: string | null
          start_date: string
          tc_no: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          birth_date?: string | null
          created_at?: string
          department_id?: string | null
          emergency_contact?: string | null
          end_date?: string | null
          full_name: string
          iban?: string | null
          id: string
          notes?: string | null
          org_id: string
          phone?: string | null
          photo_url?: string | null
          start_date: string
          tc_no?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          birth_date?: string | null
          created_at?: string
          department_id?: string | null
          emergency_contact?: string | null
          end_date?: string | null
          full_name?: string
          iban?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          start_date?: string
          tc_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_adjustments: {
        Row: {
          date: string
          days: number
          employee_id: string
          id: string
          org_id: string
          reason: string
        }
        Insert: {
          date: string
          days: number
          employee_id: string
          id: string
          org_id: string
          reason: string
        }
        Update: {
          date?: string
          days?: number
          employee_id?: string
          id?: string
          org_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          logo_url?: string | null
          name: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      overtime: {
        Row: {
          calendar_event_id: string | null
          client_ref: string
          day: string
          employee_id: string
          hours: number
          id: string
          kind: string
          multiplier: number | null
          note: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          client_ref: string
          day: string
          employee_id: string
          hours: number
          id: string
          kind?: string
          multiplier?: number | null
          note?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          client_ref?: string
          day?: string
          employee_id?: string
          hours?: number
          id?: string
          kind?: string
          multiplier?: number | null
          note?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          absence_cut: number
          base_salary: number
          bonus: number
          breakdown: Json
          debt_cut: number
          debt_override: number | null
          department_name: string | null
          employee_id: string
          employee_name: string
          extra_cut: number
          extra_cut_note: string | null
          hourly_rate: number
          id: string
          net_payable: number
          org_id: string
          overtime_pay: number
          paid_amount: number
          payroll_id: string
          skip_debt: boolean
          updated_at: string
        }
        Insert: {
          absence_cut?: number
          base_salary?: number
          bonus?: number
          breakdown?: Json
          debt_cut?: number
          debt_override?: number | null
          department_name?: string | null
          employee_id: string
          employee_name: string
          extra_cut?: number
          extra_cut_note?: string | null
          hourly_rate?: number
          id: string
          net_payable?: number
          org_id: string
          overtime_pay?: number
          paid_amount?: number
          payroll_id: string
          skip_debt?: boolean
          updated_at?: string
        }
        Update: {
          absence_cut?: number
          base_salary?: number
          bonus?: number
          breakdown?: Json
          debt_cut?: number
          debt_override?: number | null
          department_name?: string | null
          employee_id?: string
          employee_name?: string
          extra_cut?: number
          extra_cut_note?: string | null
          hourly_rate?: number
          id?: string
          net_payable?: number
          org_id?: string
          overtime_pay?: number
          paid_amount?: number
          payroll_id?: string
          skip_debt?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payrolls"
            referencedColumns: ["id"]
          },
        ]
      }
      payrolls: {
        Row: {
          created_at: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          month: number
          org_id: string
          revert_reason: string | null
          status: string
          year: number
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id: string
          month: number
          org_id: string
          revert_reason?: string | null
          status?: string
          year: number
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          month?: number
          org_id?: string
          revert_reason?: string | null
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payrolls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batches: {
        Row: {
          created_at: string
          date: string
          id: string
          label_color: string
          model_name: string
          note: string | null
          org_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          label_color: string
          model_name: string
          note?: string | null
          org_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          label_color?: string
          model_name?: string
          note?: string | null
          org_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          method: string
          note: string | null
          org_id: string
          paid_at: string
          payroll_item_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          employee_id: string
          id: string
          method: string
          note?: string | null
          org_id: string
          paid_at: string
          payroll_item_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          method?: string
          note?: string | null
          org_id?: string
          paid_at?: string
          payroll_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_days: {
        Row: {
          breaks: Json
          department_id: string | null
          end_time: string
          id: string
          is_workday: boolean
          org_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          breaks?: Json
          department_id?: string | null
          end_time?: string
          id: string
          is_workday?: boolean
          org_id: string
          start_time?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          breaks?: Json
          department_id?: string | null
          end_time?: string
          id?: string
          is_workday?: boolean
          org_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_days_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: {
        Args: { p_logo_url?: string; p_name: string }
        Returns: string
      }
      current_user_org_ids: { Args: never; Returns: string[] }
      fill_defaults: { Args: { p_rows: Json; p_table: string }; Returns: Json }
      finalize_payroll: {
        Args: { p_items: Json; p_payroll_id: string }
        Returns: undefined
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      restore_org_backup: { Args: { p_payload: Json }; Returns: undefined }
      revert_payroll: {
        Args: { p_payroll_id: string; p_reason: string }
        Returns: undefined
      }
      upsert_attendance_bulk: {
        Args: { p_confirm?: boolean; p_day: string; p_rows: Json }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
