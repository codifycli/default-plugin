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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      document_files: {
        Row: {
          created_at: string
          document_id: string
          etag: string
          file_id: string
          size: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          etag: string
          file_id: string
          size: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          etag?: string
          file_id?: string
          size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents_metadata"
            referencedColumns: ["id"]
          },
        ]
      }
      document_permissions: {
        Row: {
          created_at: string
          document_id: string
          grantee_id: string | null
          id: string
          read: boolean
          share: boolean
          type: Database["public"]["Enums"]["enum_document_permissions_type"]
          updated_at: string
          write: boolean
        }
        Insert: {
          created_at?: string
          document_id: string
          grantee_id?: string | null
          id?: string
          read?: boolean
          share?: boolean
          type: Database["public"]["Enums"]["enum_document_permissions_type"]
          updated_at?: string
          write?: boolean
        }
        Update: {
          created_at?: string
          document_id?: string
          grantee_id?: string | null
          id?: string
          read?: boolean
          share?: boolean
          type?: Database["public"]["Enums"]["enum_document_permissions_type"]
          updated_at?: string
          write?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "document_permissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents_metadata"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          blob: string | null
          created_at: string
          id: string
          name: string
          owner: string
          trash_dt: string | null
          updated_at: string
        }
        Insert: {
          blob?: string | null
          created_at?: string
          id?: string
          name: string
          owner: string
          trash_dt?: string | null
          updated_at?: string
        }
        Update: {
          blob?: string | null
          created_at?: string
          id?: string
          name?: string
          owner?: string
          trash_dt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_features: {
        Row: {
          created_at: string
          document_limits_override: number | null
          file_limits_override: number | null
          member_limits_override: number | null
          organization_id: string
          subscription_plan: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_limits_override?: number | null
          file_limits_override?: number | null
          member_limits_override?: number | null
          organization_id: string
          subscription_plan: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_limits_override?: number | null
          file_limits_override?: number | null
          member_limits_override?: number | null
          organization_id?: string
          subscription_plan?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          organization_id: string
          role: Database["public"]["Enums"]["organization_users_role"]
          user_id: string
        }
        Insert: {
          organization_id: string
          role: Database["public"]["Enums"]["organization_users_role"]
          user_id: string
        }
        Update: {
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_users_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          id: string
          name: string
          stripe_customer_id: string | null
        }
        Insert: {
          id?: string
          name: string
          stripe_customer_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      registry_plugins: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      registry_resource_parameters: {
        Row: {
          id: string
          name: string
          resource_id: string
          schema: Json | null
          type: string
        }
        Insert: {
          id?: string
          name: string
          resource_id: string
          schema?: Json | null
          type: string
        }
        Update: {
          id?: string
          name?: string
          resource_id?: string
          schema?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "registry_resource_parameters_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "registry_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_resources: {
        Row: {
          description: string | null
          documentation_url: string | null
          id: string
          plugin_id: string
          plugin_name: string
          schema: Json | null
          type: string
        }
        Insert: {
          description?: string | null
          documentation_url?: string | null
          id?: string
          plugin_id: string
          plugin_name: string
          schema?: Json | null
          type: string
        }
        Update: {
          description?: string | null
          documentation_url?: string | null
          id?: string
          plugin_id?: string
          plugin_name?: string
          schema?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "registry_resources_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "registry_plugins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registry_resources_plugin_name_fkey"
            columns: ["plugin_name"]
            isOneToOne: false
            referencedRelation: "registry_plugins"
            referencedColumns: ["name"]
          },
        ]
      }
      registry_templates: {
        Row: {
          configs: Json
          description: string | null
          id: string
          name: string
          plugin_id: string
          plugin_name: string
          recommended: boolean
        }
        Insert: {
          configs: Json
          description?: string | null
          id?: string
          name: string
          plugin_id: string
          plugin_name: string
          recommended?: boolean
        }
        Update: {
          configs?: Json
          description?: string | null
          id?: string
          name?: string
          plugin_id?: string
          plugin_name?: string
          recommended?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "registry_templates_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "registry_plugins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registry_templates_plugin_name_fkey"
            columns: ["plugin_name"]
            isOneToOne: false
            referencedRelation: "registry_plugins"
            referencedColumns: ["name"]
          },
        ]
      }
      resource_parameter_completions: {
        Row: {
          parameter_path: string
          resource_id: string
          resource_type: string
          value: string
        }
        Insert: {
          parameter_path: string
          resource_id: string
          resource_type: string
          value: string
        }
        Update: {
          parameter_path?: string
          resource_id?: string
          resource_type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_parameter_completions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "registry_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      SequelizeMeta: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          default_document_id: string | null
          email: string | null
          full_name: string | null
          id: string
          onboarding_dt: string | null
        }
        Insert: {
          default_document_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_dt?: string | null
        }
        Update: {
          default_document_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_dt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_default_document_id_fkey"
            columns: ["default_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_default_document_id_fkey"
            columns: ["default_document_id"]
            isOneToOne: false
            referencedRelation: "documents_metadata"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      documents_metadata: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          owner: string | null
          owner_name: string | null
          size: number | null
          trash_dt: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_features: {
        Row: {
          created_at: string | null
          files_limit_override: number | null
          organization_id: string | null
          subscription_plan: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_document_permissions: {
        Args: { document_id: string }
        Returns: {
          read: boolean
          share: boolean
          write: boolean
        }[]
      }
      get_user_documents_all: {
        Args: never
        Returns: {
          created_at: string
          id: string
          name: string
          owner: string
          owner_name: string
          size: number
          trash_dt: string
          updated_at: string
        }[]
      }
      get_user_organization_limits: {
        Args: never
        Returns: {
          file_size_in_bytes: number
          members_count: number
          organization_document_count: number
          plan: Json
          user_document_count: number
        }[]
      }
      has_document_read_multiple: {
        Args: { document_id: string }
        Returns: boolean
      }
    }
    Enums: {
      enum_document_permissions_type: "user" | "organization" | "link"
      organization_users_role: "owner" | "admin" | "editor"
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
      enum_document_permissions_type: ["user", "organization", "link"],
      organization_users_role: ["owner", "admin", "editor"],
    },
  },
} as const
