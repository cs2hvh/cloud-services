export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      game_servers: {
        Row: {
          allocation: number;
          created_at: string | null;
          ends_at: string | null;
          game_type: string;
          id: number;
          identifier: string;
          ip: string;
          location_id: number | null;
          name: string;
          node: number;
          plan: string | null;
          port: number;
          project_id: string | null;
          resources: Json;
          status: string | null;
          user_id: string | null;
        };
        Insert: {
          allocation: number;
          created_at?: string | null;
          ends_at?: string | null;
          game_type: string;
          id?: number;
          identifier: string;
          ip: string;
          location_id?: number | null;
          name: string;
          node: number;
          plan?: string | null;
          port: number;
          project_id?: string | null;
          resources: Json;
          status?: string | null;
          user_id?: string | null;
        };
        Update: {
          allocation?: number;
          created_at?: string | null;
          ends_at?: string | null;
          game_type?: string;
          id?: number;
          identifier?: string;
          ip?: string;
          location_id?: number | null;
          name?: string;
          node?: number;
          plan?: string | null;
          port?: number;
          project_id?: string | null;
          resources?: Json;
          status?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "game_servers_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_servers_plan_fkey";
            columns: ["plan"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_servers_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_servers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          available: boolean | null;
          city: string;
          country: string;
          country_code: string;
          id: number;
          short: string;
        };
        Insert: {
          available?: boolean | null;
          city: string;
          country: string;
          country_code: string;
          id?: number;
          short: string;
        };
        Update: {
          available?: boolean | null;
          city?: string;
          country?: string;
          country_code?: string;
          id?: number;
          short?: string;
        };
        Relationships: [];
      };
      otps: {
        Row: {
          created_at: string | null;
          email: string;
          expires_at: string;
          id: number;
          otp_code: string;
          verified: boolean | null;
        };
        Insert: {
          created_at?: string | null;
          email: string;
          expires_at: string;
          id?: number;
          otp_code: string;
          verified?: boolean | null;
        };
        Update: {
          created_at?: string | null;
          email?: string;
          expires_at?: string;
          id?: number;
          otp_code?: string;
          verified?: boolean | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          created_at: string | null;
          description: string | null;
          discount: number | null;
          id: string;
          image: string | null;
          name: string|null;
          price: number|null;
          resources: Json|null;
          sub: string | null;
          type: Database["public"]["Enums"]["product_type"];
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          discount?: number | null;
          id?: string;
          image?: string | null;
          name: string;
          price: number;
          resources: Json|null;
          sub?: string | null;
          type: Database["public"]["Enums"]["product_type"];
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          discount?: number | null;
          id?: string;
          image?: string | null;
          name?: string;
          price?: number;
          resources?: Json;
          sub?: string | null;
          type?: Database["public"]["Enums"]["product_type"];
        };
        Relationships: [];
      };
      project_logs: {
        Row: {
          created_at: string | null;
          event: string;
          id: number;
          project_id: string | null;
          text: string;
        };
        Insert: {
          created_at?: string | null;
          event: string;
          id?: number;
          project_id?: string | null;
          text: string;
        };
        Update: {
          created_at?: string | null;
          event?: string;
          id?: number;
          project_id?: string | null;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_logs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string | null;
          default_project: boolean | null;
          description: string | null;
          id: string;
          name: string;
          owner: string | null;
          users: Json | null;
        };
        Insert: {
          created_at?: string | null;
          default_project?: boolean | null;
          description?: string | null;
          id?: string;
          name: string;
          owner?: string | null;
          users?: Json | null;
        };
        Update: {
          created_at?: string | null;
          default_project?: boolean | null;
          description?: string | null;
          id?: string;
          name?: string;
          owner?: string | null;
          users?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_owner_fkey";
            columns: ["owner"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_profiles: {
        Row: {
          avatar: string | null;
          background: string | null;
          bio: string | null;
          created_at: string | null;
          discord: string | null;
          display_name: string | null;
          id: string;
          roles: Database["public"]["Enums"]["user_role"][] | null;
          steam: string | null;
          suspend: boolean | null;
          updated_at: string | null;
          username: string | null;
        };
        Insert: {
          avatar?: string | null;
          background?: string | null;
          bio?: string | null;
          created_at?: string | null;
          discord?: string | null;
          display_name?: string | null;
          id: string;
          roles?: Database["public"]["Enums"]["user_role"][] | null;
          steam?: string | null;
          suspend?: boolean | null;
          updated_at?: string | null;
          username?: string | null;
        };
        Update: {
          avatar?: string | null;
          background?: string | null;
          bio?: string | null;
          created_at?: string | null;
          discord?: string | null;
          display_name?: string | null;
          id?: string;
          roles?: Database["public"]["Enums"]["user_role"][] | null;
          steam?: string | null;
          suspend?: boolean | null;
          updated_at?: string | null;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      product_type: "vps" | "vds" | "game" | "database";
      user_role:
        | "member"
        | "admin"
        | "users"
        | "events"
        | "giveaways"
        | "application-forms"
        | "form-submissions";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never;
