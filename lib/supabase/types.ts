import { UUID } from "crypto";
import type { EncryptedData } from "@/config/functions";

// Re-export EncryptedData for convenience
export type { EncryptedData };

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




export type Admin_User={
  
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
          db_counts:number|null;
          kc_counts:number|null;
          server_counts:number|null;
          email:string | null;

}

export type Admin_Database = {
  id: string;
  name: string;
  engine: string;
  version: string | null;
  region: string | null;
  cluster_id: string;
  status: "pending" | "online" | "creating" | "migrating" | "resizing" | "deleted";
  owner_id: string;
  owner_email: string | null;
  owner_username: string | null;
  created_at: string | null;
  project_id: string;
}

export type Admin_Bucket =  {
  id: string;
  name: string;
  size:number;
  object_count:number;
  region: string | null;
  owner_id: string;
  owner_email: string | null;
  owner_username: string | null;
  status:"active",
  created_at: string | null;
  project_id: string;

}

export type Admin_SpectrumApp = {
  id: string;
  spectrum_id: string;
  protocol: string;
  origin_direct: string[];
  status: string | null;
  tls: string;
  traffic_type: string;
  ip_firewall: boolean;
  proxy_protocol: string;
  owner_id: string;
  owner_email: string | null;
  owner_username: string | null;
  created_at: string | null;
  project_id: string | null;
  edge_ips: Json | null;
  dns:  {name: string |EncryptedData, type: "A" | "CNAME",original_name?:string | null,original_protocol?:string | null} | null;
}

export type Admin_KubernetesCluster = {
  id: string;
  cluster_id: string;
  cluster_name: string;
  project_id: string;
  owner_id: string;
  owner_email: string | null;
  owner_username: string | null;
  status: "pending" | "creating" | "ready" | "failed" | "deleted";
  k8s_version: string | null;
  cni_plugin: string | null;
  node_config: NodeConfig | null;
  created_at: string | null;
  control_plane: { public_ip: string; private_ip: string; droplet_id: string } | null;
  workers: { public_ip: string; private_ip: string; droplet_id: string }[] | null;
}

export type Admin_PlatformApp = {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  branch: string;
  framework: string | null;
  port: number;
  status: string;
  git_provider: "github" | "gitlab" | "bitbucket";
  auto_deploy: boolean;
  owner_id: string;
  owner_email: string | null;
  owner_username: string | null;
  created_at: string | null;
  project_id: string | null;
}

// User-facing platform app type (without admin fields)
export type PlatformApp = {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  repository_name: string;
  repository_id: string;
  branch: string;
  framework: string | null;
  port: number | null;
  ip: string | null;
  status: string;
  git_provider: "github" | "gitlab" | "bitbucket";
  auto_deploy: boolean;
  deploy_branch: string | null;
  build_command: string | null;
  output_directory: string | null;
  size: string | null;
  user_id: string;
  project_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type Rule = {
  uuid: string;
  cluster_uuid: string;
  type: string; // e.g. "ip_addr"
  value: string; // e.g. "172.105.39.76"
  created_at: string; // ISO timestamp
};

export type network_rules = {
  rules: Rule[];
};

export interface DatabaseUser {
  id: string;           // DigitalOcean user ID/name
  name: string;         // Username
  role: string;         // mysql_role (e.g., "normal", "primary")
  password?: string;    // Optional, for reference
  created_at?: string;  // ISO timestamp
}

export interface DatabaseInstance {
  id: string;           // Database name (unique identifier)
  name: string;         // Database name
  created_at: string;   // ISO timestamp
}

export interface Database_Connection{
  ssl: boolean;
  uri: string;
  host: string | EncryptedData;
  port: number;
  user: string;
  database: string;
  password?: string | EncryptedData;
  protocol: string;

}

// Object Storage Types - Buckets only (access keys from .env)
export interface ObjectSpaceBucket {
  id?: string;
  type: 'bucket';
  name: string;
  owner_id: string;
  project_id: string | null;
  region: string;
  status: 'active' | 'creating' | 'deleting' | 'failed' | 'revoked';
  created_at: string;
  updated_at: string;
  
  // Bucket fields
  bucket_id: string | null;
  endpoint: string | null;
  acl: 'private' | 'public-read' | null;
  cors_enabled: boolean | null;
  versioning_enabled: boolean | null;
  size_bytes: number | null;
  object_count: number | null;
  
  // Optional: Bucket-specific encrypted access keys (stored directly with bucket)
  key_id: string | null;
  secret_key: string | null;
  
  // Self-referencing parent key (optional for buckets)
  //parent_access_key_id?: string | null;
}

export interface Promocodes {
  id: string;
  code: string;
  amount: number;
  redeem_by: Json;
  valid_till: string;
  coupon_type: string;
  max_redemptions: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_active: boolean;
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
          cluster_type: string;
        };
        Insert: {
          available?: boolean | null;
          city: string;
          country: string;
          country_code: string;
          id?: number;
          short: string;
          cluster_type: string;
        };
        Update: {
          available?: boolean | null;
          city?: string;
          country?: string;
          country_code?: string;
          id?: number;
          short?: string;
          cluster_type: string;
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
          discount?: number | null;
          id: string;
          image: string | null;
          name: string | null;
          price: number | null;
          fixed_price?: number | null;
          yearly_price?: number | null;
          resources: { cpu: number; ram: number; storage: number };
          sub: string | null;
          type: Database["public"]["Enums"]["product_type"];
          slug?: string | null;
          upsize_range?: { lower: number; upper: number };
          cpu_type?: 'basic' | 'general_purpose' | 'storage_optimized' | 'shared' | 'dedicated' | 'gpu' | null;
          machine_type?: string | null;
          // Pricing page fields
          billing_period?: string | null;
          specs?: string[] | null;
          features?: string[] | null;
          summary?: {
            billing?: string|undefined;
            support?: string|undefined;
            provisioning?: string|undefined;
            guarantee?: string|undefined;
            buttonText?: string|undefined;
          } | null;
          is_featured?: boolean | null;
          is_highlighted?: boolean | null;
          cta_text?: string | null;
          cta_link?: string | null;
          sort_order?: number | null;
          short_description?: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          discount?: number | null;
          id?: string;
          image?: string | null;
          name: string;
          price: number;
          fixed_price?: number | null;
          yearly_price?: number | null;
          resources: { cpu: number; ram: number; storage: number };
          sub?: string | null;
          type: Database["public"]["Enums"]["product_type"];
          slug?: string | null;
          upsize_range?: { lower: number; upper: number };
          cpu_type?: 'basic' | 'general_purpose' | 'storage_optimized' | 'shared' | 'dedicated' | 'gpu' | null;
          machine_type?: string | null;
          // Pricing page fields
          billing_period?: string | null;
          specs?: string[] | null;
          features?: string[] | null;
           summary?: {
            billing?: string|undefined;
            support?: string|undefined;
            provisioning?: string|undefined;
            guarantee?: string|undefined;
            buttonText?: string|undefined;
          } | null;
          is_featured?: boolean | null;
          is_highlighted?: boolean | null;
          cta_text?: string | null;
          cta_link?: string | null;
          sort_order?: number | null;
          short_description?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          discount?: number | null;
          id?: string;
          image?: string | null;
          name?: string;
          price?: number;
          fixed_price?: number | null;
          yearly_price?: number | null;
          resources?: Json;
          sub?: string | null;
          type?: Database["public"]["Enums"]["product_type"];
          slug?: string | null;
          upsize_range?: { lower: number; upper: number };
          cpu_type?: 'basic' | 'general_purpose' | 'storage_optimized' | 'shared' | 'dedicated' | 'gpu' | null;
          machine_type?: string | null;
          // Pricing page fields
          billing_period?: string | null;
          specs?: string[] | null;
          features?: string[] | null;
          summary?: {
            billing?: string;
            support?: string;
            provisioning?: string;
            guarantee?: string;
            buttonText?: string;
          } | null;
          is_featured?: boolean | null;
          is_highlighted?: boolean | null;
          cta_text?: string | null;
          cta_link?: string | null;
          sort_order?: number | null;
          short_description?: string | null;
        };
        Relationships: [];
      };
      pricing_categories: {
        Row: {
          id: number;
          slug: string;
          label: string;
          description: string | null;
          starting_price_label: string | null;
          starting_price_description: string | null;
          sort_order: number;
          active: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          slug: string;
          label: string;
          description?: string | null;
          starting_price_label?: string | null;
          starting_price_description?: string | null;
          sort_order?: number;
          active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          slug?: string;
          label?: string;
          description?: string | null;
          starting_price_label?: string | null;
          starting_price_description?: string | null;
          sort_order?: number;
          active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      pricing_promos: {
        Row: {
          id: string;
          category_slug: string;
          badge: string;
          badge_note: string | null;
          title: string;
          description: string;
          subtext: string | null;
          price_old: string | null;
          price_current: string | null;
          link_text: string;
          link_href: string;
          sort_order: number;
          active: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          category_slug: string;
          badge: string;
          badge_note?: string | null;
          title: string;
          description: string;
          subtext?: string | null;
          price_old?: string | null;
          price_current?: string | null;
          link_text: string;
          link_href: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          category_slug?: string;
          badge?: string;
          badge_note?: string | null;
          title?: string;
          description?: string;
          subtext?: string | null;
          price_old?: string | null;
          price_current?: string | null;
          link_text?: string;
          link_href?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
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
      activities: {
        Row: {
          id: string;
          cluster_name: string;
          cluster_type: string;
          action: string;
          created_at: string | null;
          owner_id: string | null;
          project_id: string | null;
        };
        Insert: {
          id?: string;
          cluster_name: string;
          cluster_type: string;
          action: string;
          created_at?: string | null;
          owner_id?: string | null;
          project_id?: string | null;
        };
        Update: {
          id?: string;
          cluster_name?: string;
          cluster_type?: string;
          action?: string;
          created_at?: string | null;
          owner_id?: string | null;
          project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activities_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_project_id_fkey";
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
          email:string | null;
          cluster_stats:{game_servers:number; db_clusters:number; kubernetes_clusters:number} | null;
          steam: string | null;
          suspend: boolean | null;
          two_factor_enabled: boolean | null;
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
          email:string | null;
          cluster_stats:{game_servers:number; db_clusters:number; kubernetes_clusters:number} | null;
          steam?: string | null;
          suspend?: boolean | null;
          two_factor_enabled?: boolean | null;
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
          two_factor_enabled?: boolean | null;
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
          createDroplet?: boolean;
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
          createDroplet?: boolean;
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
          create_droplet?: boolean;
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
          create_droplet?: boolean;
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
       database_clusters: {
        Row: {
          id?:string
          name: string;
          engine: string;
          project_id:string;
          owner_id:string;
          version?: string | null; // e.g., API VIP or CP-1 IP
          num_nodes?: number; // list of worker IPs/hosts
          cluster_id?: UUID;
          public_connection?: Database_Connection;
          private_connection?: Database_Connection;
          status: "pending" | "online" | "creating" | "migrating" | "resizing" | "deleted";
          password: string | EncryptedData;
          // resource_config?:{ cpu: number; ram: number; storage: number }
          size:string;
          region?:string;
          ca_certificate?: string | EncryptedData;
          network_rules?:network_rules;
          users?: DatabaseUser[];
          dbs?: DatabaseInstance[];
          window?: { day: string; hour: string };
          storage_size_mib?:number;

        };
        Insert: {
          name: string;
          engine: string;
          project_id:string;
          owner_id:string;
          version?: string | null; // e.g., API VIP or CP-1 IP
          num_nodes?: number; // list of worker IPs/hosts
          cluster_id?: UUID;
          public_connection?: Database_Connection;
          private_connection?: Database_Connection;
          status: "pending" | "online" | "creating" | "migrating" | "resizing" | "deleted";
          password: string | EncryptedData;
          ca_certificate?: string | EncryptedData;
          region?:string;
          network_rules?:network_rules;
          users?: DatabaseUser[];
          dbs?: DatabaseInstance[];
          storage_size_mib?:number;
          // resource_config?:{ cpu: number; ram: number; storage: number }

        };
         Relationships: [
           {
            foreignKeyName: "database_owner_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
           {
            foreignKeyName: "database_project_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
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
          engine: string;
          project_id:string;
          owner_id:string;
          version?: string | null; // e.g., API VIP or CP-1 IP
          num_nodes?: number; // list of worker IPs/hosts
          cluster_id?: UUID;
          public_connection?: Database_Connection;
          private_connection?: Database_Connection;
          status: "pending" | "online" | "creating" | "migrating" ;
          password: string | EncryptedData;
          // resource_config?:{ cpu: number; ram: number; storage: number }
          size:string;
          region?:string;
          ca_certificate?: string | EncryptedData;
          network_rules?:network_rules;
          users?: DatabaseUser[];
          dbs?: DatabaseInstance[];
          window?: { day: string; hour: string };

        };
        Insert: {
          id?: number;
          vmid?: number | null;
          node?: string | null;
          name: string;
          engine: string;
          project_id:string;
          owner_id:string;
          version?: string | null; // e.g., API VIP or CP-1 IP
          num_nodes?: number; // list of worker IPs/hosts
          cluster_id?: UUID;
          public_connection?: Database_Connection;
          private_connection?: Database_Connection;
          status: "pending" | "online" | "creating" ;
          password: string | EncryptedData;
          ca_certificate?: string | EncryptedData;
          region?:string;
          network_rules?:network_rules;
          users?: DatabaseUser[];
          dbs?: DatabaseInstance[];
          // resource_config?:{ cpu: number; ram: number; storage: number }

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
         {
            foreignKeyName: "database_project_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      object_spaces: {
        Row: {
          id: string;
          type: "access_key" | "bucket";
          name: string;
          owner_id: string;
          project_id: string | null;
          region: string;
          status: "active" | "creating" | "deleting" | "revoked" | "failed";
          created_at: string;
          updated_at: string;
          key_id: string | null;
          secret_key: string | null;
          bucket_id: string | null;
          parent_access_key_id: string | null;
          endpoint: string | null;
          acl: "private" | "public-read" | null;
          cors_enabled: boolean | null;
          versioning_enabled: boolean | null;
          size_bytes: number | null;
          object_count: number | null;
        };
        Insert: {
          id?: string;
          type: "access_key" | "bucket";
          name: string;
          owner_id: string;
          project_id?: string | null;
          region: string;
          status?: "active" | "creating" | "deleting" | "revoked" | "failed";
          created_at?: string;
          updated_at?: string;
          key_id?: string | null;
          secret_key?: string | null;
          bucket_id?: string | null;
          parent_access_key_id?: string | null;
          endpoint?: string | null;
          acl?: "private" | "public-read" | null;
          cors_enabled?: boolean | null;
          versioning_enabled?: boolean | null;
          size_bytes?: number | null;
          object_count?: number | null;
        };
        Update: {
          id?: string;
          type?: "access_key" | "bucket";
          name?: string;
          owner_id?: string;
          project_id?: string | null;
          region?: string;
          status?: "active" | "creating" | "deleting" | "revoked" | "failed";
          created_at?: string;
          updated_at?: string;
          key_id?: string | null;
          secret_key?: string | null;
          bucket_id?: string | null;
          parent_access_key_id?: string | null;
          endpoint?: string | null;
          acl?: "private" | "public-read" | null;
          cors_enabled?: boolean | null;
          versioning_enabled?: boolean | null;
          size_bytes?: number | null;
          object_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "object_spaces_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "object_spaces_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "object_spaces_parent_access_key_id_fkey";
            columns: ["parent_access_key_id"];
            isOneToOne: false;
            referencedRelation: "object_spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      spectrum_apps: {
        Row: {
          id: string; // surrogate uuid
          spectrum_id: string; // cloudflare id
          dns:  {name: string |EncryptedData, type: "A" | "CNAME",original_name?:string | null,original_protocol?:string | null}; // {name: string (encrypted), type: "A" | "CNAME"}
          tls: "off" | "full"|"strict"|"flexible";
          edge_ips: Json; // {type: string, connectivity: string}
          ip_firewall: boolean;
          traffic_type: string;
          origin_direct: string[]; // array of origin IPs/hostnames
          proxy_protocol: string;
          protocol: string;
          owner_id: string;
          project_id: string | null;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          spectrum_id: string;
          dns: Json; // {name: string (encrypted), type: "A" | "CNAME"}
           tls: "off" | "full"|"strict"|"flexible";
          edge_ips?: Json; // {type: string, connectivity: string}
          ip_firewall?: boolean;
          traffic_type?: string;
          origin_direct?: string[]; // array of origin IPs/hostnames
          proxy_protocol?: string;
          protocol: string;
          owner_id: string;
          project_id?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          spectrum_id?: string;
          dns?: Json; // {name: string (encrypted), type: "A" | "CNAME"}
           tls: "off" | "full"|"strict"|"flexible";
          edge_ips?: Json; // {type: string, connectivity: string}
          ip_firewall?: boolean;
          traffic_type?: string;
          origin_direct?: string[]; // array of origin IPs/hostnames
          proxy_protocol?: string;
          protocol?: string;
          owner_id?: string;
          project_id?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "spectrum_apps_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spectrum_apps_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
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
      product_type: "vps" | "vds" | "game" | "database" | "object-storage" | "kubernetes" | "network-ddos" | "platform-apps" | "compute" | "gpu" | "security" | "ai-deployment" | "app-deployment";
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
  billing: {
    Tables: {
      user_credits: {
        Row: { id: string; user_id: string; credit_balance: number; created_at: string | null };
        Insert: { id?: string; user_id: string; credit_balance?: number; created_at?: string | null };
        Update: { id?: string; user_id?: string; credit_balance?: number; created_at?: string | null };
        Relationships: [];
      };
      promocodes: {
        Row: { 
          id: string; 
          code: string; 
          amount: number; 
          redeem_by: {email:string,redeemed_at:string}[]|null; 
          valid_till: string; 
          coupon_type: string; 
          max_redemptions: number | null; 
          created_by: string | null; 
          created_at: string | null; 
          updated_at: string | null; 
          is_active: boolean; 
        };
        Insert: { 
          id?: string; 
          code: string; 
          amount: number; 
          redeem_by: {email:string,redeemed_at:string}[]|null; 
          valid_till: string; 
          coupon_type: string; 
          max_redemptions?: number | null; 
          created_by?: string | null; 
          created_at?: string | null; 
          updated_at?: string | null; 
          is_active?: boolean; 
        };
        Update: { 
          id?: string; 
          code?: string; 
          amount?: number; 
          redeem_by: {email:string,redeemed_at:string}[]|null;  
          valid_till?: string; 
          coupon_type?: string; 
          max_redemptions?: number | null; 
          created_by?: string | null; 
          created_at?: string | null; 
          updated_at?: string | null; 
          is_active?: boolean; 
        };
        Relationships: [];
      };
      active_kubernetes: {
        Row: { id: string; service_id: string; user_id: string; hourly_rate: number; status: string; created_at: string | null; updated_at: string | null; last_billed_at: string | null };
        Insert: { id?: string; service_id: string; user_id: string; hourly_rate: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Update: { id?: string; service_id?: string; user_id?: string; hourly_rate?: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Relationships: [];
      };
      active_database: {
        Row: { id: string; service_id: string; user_id: string; hourly_rate: number; status: string; created_at: string | null; updated_at: string | null; last_billed_at: string | null };
        Insert: { id?: string; service_id: string; user_id: string; hourly_rate: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Update: { id?: string; service_id?: string; user_id?: string; hourly_rate?: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Relationships: [];
      };
      active_objectspace: {
        Row: { id: string; service_id: string; user_id: string; hourly_rate: number; status: string; created_at: string | null; updated_at: string | null; last_billed_at: string | null };
        Insert: { id?: string; service_id: string; user_id: string; hourly_rate: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Update: { id?: string; service_id?: string; user_id?: string; hourly_rate?: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Relationships: [];
      };
      active_spectrum: {
        Row: { id: string; service_id: string; user_id: string; hourly_rate: number; status: string; created_at: string | null; updated_at: string | null; last_billed_at: string | null };
        Insert: { id?: string; service_id: string; user_id: string; hourly_rate: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Update: { id?: string; service_id?: string; user_id?: string; hourly_rate?: number; status?: string; created_at?: string | null; updated_at?: string | null; last_billed_at?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
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

// Promocode types
export type Promocode = Database["billing"]["Tables"]["promocodes"]["Row"];
export type PromocodeInsert = Database["billing"]["Tables"]["promocodes"]["Insert"];
export type PromocodeUpdate = Database["billing"]["Tables"]["promocodes"]["Update"];

export interface RedeemedUser {
  email: string;
  userId: string;
  redeemedAt: string;
}

export interface Admin_Promocode extends Promocode {
  redemption_count?: number;
}

export interface Coupon {
  id: string;
  code: string;
  amount: number;
  redeem_by: Array<{ email: string; redeemedAt: string }>;
  valid_till: string;
  coupon_type: string;
  max_redemptions: number | null;
  is_active: boolean;
  created_at: string;
  redemption_count?: number;
}

// ============================================
// DATABASE INTEGRATION TYPES
// ============================================

export type IntegrationStatus = 'pending' | 'linked' | 'failed' | 'unlinked';

export interface DatabaseIntegration {
  id: string;
  database_cluster_id: string;
  platform_app_id: string;
  user_id: string;
  project_id: string | null;
  status: IntegrationStatus;
  injected_env_keys: string[];
  env_prefix: string;
  created_at: string;
  updated_at: string;
  unlinked_at: string | null;
  unlinked_by: string | null;
  error_message: string | null;
}

export interface DatabaseIntegrationInsert {
  database_cluster_id: string;
  platform_app_id: string;
  user_id: string;
  project_id?: string | null;
  status?: IntegrationStatus;
  injected_env_keys?: string[];
  env_prefix?: string;
}

export interface DatabaseIntegrationUpdate {
  status?: IntegrationStatus;
  injected_env_keys?: string[];
  unlinked_at?: string | null;
  unlinked_by?: string | null;
  error_message?: string | null;
}

// Environment variable generation result
export interface GeneratedEnvVars {
  vars: Array<{ key: string; value: string }>;
  keys: string[];
}

// ============================================
// OBJECT STORAGE INTEGRATION TYPES
// ============================================

export type ObjectStorageIntegrationStatus = 'pending' | 'linked' | 'failed' | 'unlinked';

export interface ObjectStorageIntegration {
  id: string;
  object_space_id: string;
  platform_app_id: string;
  user_id: string;
  project_id: string | null;
  status: ObjectStorageIntegrationStatus;
  injected_env_keys: string[];
  env_prefix: string;
  created_at: string;
  updated_at: string;
  unlinked_at: string | null;
  unlinked_by: string | null;
  error_message: string | null;
}

export interface ObjectStorageIntegrationInsert {
  object_space_id: string;
  platform_app_id: string;
  user_id: string;
  project_id?: string | null;
  status?: ObjectStorageIntegrationStatus;
  injected_env_keys?: string[];
  env_prefix?: string;
}

export interface ObjectStorageIntegrationUpdate {
  status?: ObjectStorageIntegrationStatus;
  injected_env_keys?: string[];
  unlinked_at?: string | null;
  unlinked_by?: string | null;
  error_message?: string | null;
}
