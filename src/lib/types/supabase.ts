// src/lib/types/supabase.ts
// PLACEHOLDER — Reemplazar con los tipos reales generados por Supabase CLI:
//   npx supabase gen types typescript --project-id TU_PROJECT_ID > src/lib/types/supabase.ts
//
// Este archivo permite que el proyecto compile mientras configuras Supabase.

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['companies']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          company_id: string | null;
          full_name: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      roles: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['roles']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['roles']['Insert']>;
      };
      permissions: {
        Row: {
          id: string;
          key: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['permissions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>;
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string };
        Insert: Database['public']['Tables']['role_permissions']['Row'];
        Update: Partial<Database['public']['Tables']['role_permissions']['Row']>;
      };
      user_roles: {
        Row: { user_id: string; role_id: string; assigned_at: string };
        Insert: Omit<Database['public']['Tables']['user_roles']['Row'], 'assigned_at'>;
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
