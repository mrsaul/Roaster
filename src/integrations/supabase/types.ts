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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      client_onboarding: {
        Row: {
          admin_notes: string | null
          client_data_mode: string
          coffee_type: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          current_step: number | null
          custom_company_name: string | null
          custom_contact_name: string | null
          custom_delivery_address: string | null
          custom_email: string | null
          custom_phone: string | null
          custom_pricing_tier: string | null
          delivery_address: string | null
          delivery_instructions: string | null
          delivery_time_window: string | null
          email: string | null
          estimated_weekly_volume: number | null
          grinder_type: string | null
          id: string
          last_synced_at: string | null
          legal_company_name: string | null
          min_order_kg: number | null
          notes: string | null
          onboarding_status: string | null
          payment_terms: string | null
          phone: string | null
          preferred_delivery_days: string[] | null
          pricing_tier: string | null
          pricing_tier_id: string | null
          sellsy_client_id: string | null
          siret: string | null
          updated_at: string
          user_id: string
          vat_number: string | null
        }
        Insert: {
          admin_notes?: string | null
          client_data_mode?: string
          coffee_type?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          current_step?: number | null
          custom_company_name?: string | null
          custom_contact_name?: string | null
          custom_delivery_address?: string | null
          custom_email?: string | null
          custom_phone?: string | null
          custom_pricing_tier?: string | null
          delivery_address?: string | null
          delivery_instructions?: string | null
          delivery_time_window?: string | null
          email?: string | null
          estimated_weekly_volume?: number | null
          grinder_type?: string | null
          id?: string
          last_synced_at?: string | null
          legal_company_name?: string | null
          min_order_kg?: number | null
          notes?: string | null
          onboarding_status?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_delivery_days?: string[] | null
          pricing_tier?: string | null
          pricing_tier_id?: string | null
          sellsy_client_id?: string | null
          siret?: string | null
          updated_at?: string
          user_id: string
          vat_number?: string | null
        }
        Update: {
          admin_notes?: string | null
          client_data_mode?: string
          coffee_type?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          current_step?: number | null
          custom_company_name?: string | null
          custom_contact_name?: string | null
          custom_delivery_address?: string | null
          custom_email?: string | null
          custom_phone?: string | null
          custom_pricing_tier?: string | null
          delivery_address?: string | null
          delivery_instructions?: string | null
          delivery_time_window?: string | null
          email?: string | null
          estimated_weekly_volume?: number | null
          grinder_type?: string | null
          id?: string
          last_synced_at?: string | null
          legal_company_name?: string | null
          min_order_kg?: number | null
          notes?: string | null
          onboarding_status?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_delivery_days?: string[] | null
          pricing_tier?: string | null
          pricing_tier_id?: string | null
          sellsy_client_id?: string | null
          siret?: string | null
          updated_at?: string
          user_id?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_per_kg: number
          product_id: string
          product_name: string
          product_sku: string | null
          quantity: number
          size_kg: number | null
          size_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price_per_kg?: number
          product_id: string
          product_name: string
          product_sku?: string | null
          quantity?: number
          size_kg?: number | null
          size_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_per_kg?: number
          product_id?: string
          product_name?: string
          product_sku?: string | null
          quantity?: number
          size_kg?: number | null
          size_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          order_id: string
          status: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          order_id: string
          status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          delivery_date: string
          delivery_discount_percent: number
          discount_percent: number
          id: string
          invoicing_status: string
          is_labeled: boolean
          is_packed: boolean
          is_roasted: boolean
          last_invoice_sync: string | null
          pricing_tier_name: string | null
          sellsy_id: string | null
          status: string
          total_kg: number
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_date: string
          delivery_discount_percent?: number
          discount_percent?: number
          id?: string
          invoicing_status?: string
          is_labeled?: boolean
          is_packed?: boolean
          is_roasted?: boolean
          last_invoice_sync?: string | null
          pricing_tier_name?: string | null
          sellsy_id?: string | null
          status?: string
          total_kg?: number
          total_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          delivery_discount_percent?: number
          discount_percent?: number
          id?: string
          invoicing_status?: string
          is_labeled?: boolean
          is_packed?: boolean
          is_roasted?: boolean
          last_invoice_sync?: string | null
          pricing_tier_name?: string | null
          sellsy_id?: string | null
          status?: string
          total_kg?: number
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_tiers: {
        Row: {
          created_at: string
          delivery_discount_percent: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          product_discount_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_discount_percent?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_discount_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_discount_percent?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_discount_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          price: number
          product_id: string
          size_kg: number
          size_label: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          price?: number
          product_id: string
          size_kg: number
          size_label: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          price?: number
          product_id?: string
          size_kg?: number
          size_label?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          custom_name: string | null
          custom_price_per_kg: number | null
          data_source_mode: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          origin: string | null
          price_per_kg: number
          process: string | null
          roast_level: string | null
          sellsy_id: string
          sku: string | null
          synced_at: string
          tags: string[] | null
          tasting_notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          custom_price_per_kg?: number | null
          data_source_mode?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          origin?: string | null
          price_per_kg?: number
          process?: string | null
          roast_level?: string | null
          sellsy_id: string
          sku?: string | null
          synced_at?: string
          tags?: string[] | null
          tasting_notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          custom_price_per_kg?: number | null
          data_source_mode?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          origin?: string | null
          price_per_kg?: number
          process?: string | null
          roast_level?: string | null
          sellsy_id?: string
          sku?: string | null
          synced_at?: string
          tags?: string[] | null
          tasting_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          completed_at: string
          created_at: string
          created_by: string
          id: string
          parse_errors: Json
          source: string
          started_at: string
          status: string
          sync_type: string
          synced_count: number
          updated_at: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          created_by: string
          id?: string
          parse_errors?: Json
          source: string
          started_at?: string
          status?: string
          sync_type: string
          synced_count?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          created_by?: string
          id?: string
          parse_errors?: Json
          source?: string
          started_at?: string
          status?: string
          sync_type?: string
          synced_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          invited_at: string | null
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_update_own_onboarding: {
        Args: {
          _coffee_type?: string
          _company_name?: string
          _contact_name?: string
          _current_step?: number
          _custom_company_name?: string
          _custom_contact_name?: string
          _custom_delivery_address?: string
          _custom_email?: string
          _custom_phone?: string
          _delivery_address?: string
          _delivery_instructions?: string
          _delivery_time_window?: string
          _email?: string
          _estimated_weekly_volume?: number
          _grinder_type?: string
          _id: string
          _legal_company_name?: string
          _notes?: string
          _onboarding_status?: string
          _phone?: string
          _preferred_delivery_days?: string[]
          _siret?: string
          _vat_number?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "roaster" | "packaging"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "roaster", "packaging"],
    },
  },
} as const
