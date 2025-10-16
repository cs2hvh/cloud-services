export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

interface NodeConfig {
  ram: number;
  cpu: number;
  storage: number;
}

export type Database = {
  public: {
    Tables: {
      apps: {
        Row: {
          id: string;
          name: string;
          github_url: string;
          port: number;
          user_id: string | null;
          project_id: string | null;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          github_url: string;
          port: number;
          user_id?: string | null;
          project_id?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          github_url?: string;
          port?: number;
          user_id?: string | null;
          project_id?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "apps_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "apps_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
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
          name: string | null;
          price: number | null;
          resources: Json | null;
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
          resources: Json | null;
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
      clusters: {
        Row: {
          clusterId: string;
          id: string;
          clusterName: string;
          project_id:string;
          owner_id:string;
          controlPlane?: string | null; // e.g., API VIP or CP-1 IP
          workers?: string[]; // list of worker IPs/hosts
          createStatus?: boolean;
          connectStatus?: boolean;
          verifyStatus?: boolean;
          kubeConfig?: string | null; // kubeconfig YAML
          nodeConfig?: NodeConfig | null; // {region, plan, cpu, ram, disk ...}
          cniPlugin?: "flannel" | "calico" | "cilium" | string | null;
          k8sVersion?: string | null;
          status?: "pending" | "creating" | "ready" | "failed" | "deleted";
          password: string | null;
        };
        Insert: {
          clusterId: string;
          clusterName: string;

          controlPlane?: string | null; // e.g., API VIP or CP-1 IP
          workers?: string[]; // list of worker IPs/hosts
          createStatus?: boolean;
          connectStatus?: boolean;
          verifyStatus?: boolean;

          kubeConfig?: string | null; // kubeconfig YAML
          nodeConfig?: NodeConfig | null; // {region, plan, cpu, ram, disk ...}

          cniPlugin?: "flannel" | "calico" | "cilium" | string | null;
          k8sVersion?: string | null;

          status?: "pending" | "creating" | "ready" | "failed" | "deleted";
          password: string | null;
        };
         Relationships: [];
      };
      clusters_get: {
        Row: {
          cluster_id: string;
          cluster_name: string;
          project_id:string;
          owner_id:string;
          control_plane?: { public_ip: string; private_ip: string; droplet_id: string } | null; // e.g., API VIP or CP-1 IP
          workers?: { public_ip: string; private_ip: string; droplet_id: string }[] | null; // list of worker IPs/hosts
          create_status?: boolean;
          connect_status?: boolean;
          verify_status?: boolean;
          kube_config?: string | null; // kubeconfig YAML
          node_config?: NodeConfig | null; // {region, plan, cpu, ram, disk ...}
          cni_plugin?: "flannel" | "calico" | "cilium" | string | null;
          k8s_version?: string | null;
          status?: "pending" | "creating" | "ready" | "failed" | "deleted";
        };
        Insert: {
           cluster_id: string;
          cluster_name: string;
          project_id:string;
          owner_id:string;
          control_plane?: string | null; // e.g., API VIP or CP-1 IP
          workers?: string[]; // list of worker IPs/hosts
          create_status?: boolean;
          connect_status?: boolean;
          verify_status?: boolean;
          kube_config?: string | null; // kubeconfig YAML
          node_config?: NodeConfig | null; // {region, plan, cpu, ram, disk ...}
          cni_plugin?: "flannel" | "calico" | "cilium" | string | null;
          k8s_version?: string | null;
          status?: "pending" | "creating" | "ready" | "failed" | "deleted";
        };
         Relationships: [];
      };
      proxmox_hosts: {
        Row: {
          id: string;
          name: string;
          host_url: string;
          allow_insecure_tls: boolean;
          token_id: string | null;
          token_secret: string | null;
          username: string | null;
          password: string | null;
          node: string;
          storage: string;
          bridge: string;
          gateway_ip: string | null;
          dns_primary: string | null;
          dns_secondary: string | null;
          template_vmid: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          host_url: string;
          allow_insecure_tls?: boolean;
          token_id?: string | null;
          token_secret?: string | null;
          username?: string | null;
          password?: string | null;
          node: string;
          storage: string;
          bridge?: string;
          gateway_ip?: string | null;
          dns_primary?: string | null;
          dns_secondary?: string | null;
          template_vmid?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          host_url?: string;
          allow_insecure_tls?: boolean;
          token_id?: string | null;
          token_secret?: string | null;
          username?: string | null;
          password?: string | null;
          node?: string;
          storage?: string;
          bridge?: string;
          gateway_ip?: string | null;
          dns_primary?: string | null;
          dns_secondary?: string | null;
          template_vmid?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      public_ips: {
        Row: {
          id: number;
          host_id: string;
          ip: string;
          pool_id: number | null;
          is_used: boolean;
          server_id: number | null;
          allocated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          host_id: string;
          ip: string;
          pool_id?: number | null;
          is_used?: boolean;
          server_id?: number | null;
          allocated_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          host_id?: string;
          ip?: string;
          pool_id?: number | null;
          is_used?: boolean;
          server_id?: number | null;
          allocated_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "public_ips_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "proxmox_hosts";
            referencedColumns: ["id"];
          },
        ];
      };
      proxmox_templates: {
        Row: {
          id: number;
          host_id: string;
          vmid: number;
          name: string;
          os_type: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          host_id: string;
          vmid: number;
          name: string;
          os_type?: string | null;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: number;
          host_id?: string;
          vmid?: number;
          name?: string;
          os_type?: string | null;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proxmox_templates_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "proxmox_hosts";
            referencedColumns: ["id"];
          },
        ];
      };
      servers: {
        Row: {
          id: number;
          vmid: number | null;
          node: string | null;
          name: string;
          ip: string;
          os: string | null;
          location: string;
          cpu_cores: number;
          memory_mb: number;
          disk_gb: number;
          status: string;
          owner_id: string | null;
          owner_email: string | null;
          hourly_cost: number;
          monthly_cost: number;
          billing_start: string | null;
          billing_end: string | null;
          details: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          vmid?: number | null;
          node?: string | null;
          name: string;
          ip: string;
          os?: string | null;
          location: string;
          cpu_cores: number;
          memory_mb: number;
          disk_gb: number;
          status?: string;
          owner_id?: string | null;
          owner_email?: string | null;
          hourly_cost?: number;
          monthly_cost?: number;
          billing_start?: string | null;
          billing_end?: string | null;
          details?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          vmid?: number | null;
          node?: string | null;
          name?: string;
          ip?: string;
          os?: string | null;
          location?: string;
          cpu_cores?: number;
          memory_mb?: number;
          disk_gb?: number;
          status?: string;
          owner_id?: string | null;
          owner_email?: string | null;
          hourly_cost?: number;
          monthly_cost?: number;
          billing_start?: string | null;
          billing_end?: string | null;
          details?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "servers_location_fkey";
            columns: ["location"];
            isOneToOne: false;
            referencedRelation: "proxmox_hosts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "servers_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
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
