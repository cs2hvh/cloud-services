SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE TYPE "public"."product_type" AS ENUM (
    'vps',
    'vds',
    'game',
    'database',
    'bucket',
    'object-storage'
);
ALTER TYPE "public"."product_type" OWNER TO "postgres";
CREATE TYPE "public"."user_role" AS ENUM (
    'member',
    'admin',
    'users',
    'events',
    'giveaways',
    'application-forms',
    'form-submissions'
);
ALTER TYPE "public"."user_role" OWNER TO "postgres";
CREATE TYPE "public"."vm_status" AS ENUM (
    'free',
    'used'
);
ALTER TYPE "public"."vm_status" OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.user_profiles (id, username, display_name)
    VALUES (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'display_name');
    RETURN new;
END;
$$;
ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $_$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = $1 AND role = 'admin'
  );
$_$;
ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end$$;
ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cluster_name" "text" NOT NULL,
    "cluster_type" "text" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "owner_id" "uuid",
    "project_id" "uuid"
);
ALTER TABLE "public"."activities" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."clusters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cluster_id" "text" NOT NULL,
    "cluster_name" "text" NOT NULL,
    "control_plane" "jsonb",
    "workers" "jsonb" DEFAULT '[]'::"jsonb",
    "create_status" boolean DEFAULT false,
    "connect_status" boolean DEFAULT false,
    "verify_status" boolean DEFAULT false,
    "kubeconfig" "text",
    "node_config" "jsonb",
    "cni_plugin" "text",
    "k8s_version" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "vm_password" "text",
    CONSTRAINT "clusters_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'creating'::"text", 'ready'::"text", 'failed'::"text", 'deleted'::"text"])))
);
ALTER TABLE "public"."clusters" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."database_cluster" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "engine" "text",
    "version" "text" DEFAULT 'NULL'::"text",
    "num_nodes" integer,
    "cluster_id" "uuid",
    "public_connection" "jsonb",
    "private_connection" "jsonb" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "ca_certificate" "jsonb",
    "region" "text",
    "size" "text",
    "network_rules" "jsonb"[],
    "users" "jsonb"[],
    "dbs" "jsonb" DEFAULT '[]'::"jsonb",
    "window" "jsonb"
);
ALTER TABLE "public"."database_cluster" OWNER TO "postgres";
COMMENT ON COLUMN "public"."database_cluster"."users" IS 'Array of database users with their credentials and roles';
COMMENT ON COLUMN "public"."database_cluster"."dbs" IS 'Array of databases with their metadata';
COMMENT ON COLUMN "public"."database_cluster"."window" IS 'stores the time and day when the db cluster would update its vm software and dependencies keeping one thing in mind that db cluster is not in use at that time';
CREATE TABLE IF NOT EXISTS "public"."database_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon_url" "text",
    "versions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "available" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."database_types" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."game_servers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "game_type" "text" NOT NULL,
    "resources" "jsonb" NOT NULL,
    "ip" "text" NOT NULL,
    "port" integer NOT NULL,
    "node" integer NOT NULL,
    "identifier" "text" NOT NULL,
    "allocation" integer NOT NULL,
    "ends_at" timestamp with time zone,
    "plan" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "project_id" "uuid",
    "user_id" "uuid",
    "location_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."game_servers" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."game_servers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."game_servers_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."game_servers_id_seq" OWNED BY "public"."game_servers"."id";
CREATE TABLE IF NOT EXISTS "public"."github_tokens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "access_token" "text" NOT NULL,
    "github_username" "text" NOT NULL,
    "github_user_id" bigint NOT NULL,
    "scopes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."github_tokens" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" bigint NOT NULL,
    "short" "text" NOT NULL,
    "city" "text" NOT NULL,
    "country" "text" NOT NULL,
    "country_code" "text" NOT NULL,
    "available" boolean DEFAULT true,
    "cluster_type" "text"
);
ALTER TABLE "public"."locations" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."locations_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."locations_id_seq" OWNED BY "public"."locations"."id";
CREATE TABLE IF NOT EXISTS "public"."object_spaces" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid",
    "project_id" "uuid",
    "region" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bucket_id" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "acl" "text" DEFAULT 'private'::"text" NOT NULL,
    "cors_enabled" boolean DEFAULT false,
    "versioning_enabled" boolean DEFAULT false,
    "size_bytes" bigint DEFAULT 0,
    "object_count" integer DEFAULT 0,
    "secret_key" "text",
    "key_id" "text",
    CONSTRAINT "object_spaces_type_check" CHECK (("type" = 'bucket'::"text")),
    CONSTRAINT "valid_bucket" CHECK ((("bucket_id" IS NOT NULL) AND ("endpoint" IS NOT NULL) AND ("acl" IS NOT NULL)))
);
ALTER TABLE "public"."object_spaces" OWNER TO "postgres";
COMMENT ON TABLE "public"."object_spaces" IS 'Stores DigitalOcean Spaces buckets. Access keys are managed via environment variables.';
CREATE TABLE IF NOT EXISTS "public"."otps" (
    "id" bigint NOT NULL,
    "email" "text" NOT NULL,
    "otp_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "verified" boolean DEFAULT false
);
ALTER TABLE "public"."otps" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."otps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."otps_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."otps_id_seq" OWNED BY "public"."otps"."id";
CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image" "text",
    "type" "public"."product_type" NOT NULL,
    "sub" "text",
    "resources" "jsonb" NOT NULL,
    "discount" numeric(5,2),
    "price" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."products" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_logs" (
    "id" bigint NOT NULL,
    "event" "text" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid"
);
ALTER TABLE "public"."project_logs" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."project_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."project_logs_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."project_logs_id_seq" OWNED BY "public"."project_logs"."id";
CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "default_project" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "owner" "uuid",
    "users" "jsonb" DEFAULT '[]'::"jsonb"
);
ALTER TABLE "public"."projects" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."proxmox_hosts" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "host_url" "text" NOT NULL,
    "allow_insecure_tls" boolean DEFAULT false,
    "token_id" "text",
    "token_secret" "text",
    "username" "text",
    "password" "text",
    "node" "text" NOT NULL,
    "storage" "text" NOT NULL,
    "bridge" "text" DEFAULT 'vmbr0'::"text" NOT NULL,
    "gateway_ip" "inet",
    "dns_primary" "inet",
    "dns_secondary" "inet",
    "template_vmid" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."proxmox_hosts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."proxmox_templates" (
    "id" bigint NOT NULL,
    "host_id" "text" NOT NULL,
    "vmid" integer NOT NULL,
    "name" "text" NOT NULL,
    "os_type" "text",
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."proxmox_templates" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."proxmox_templates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."proxmox_templates_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."proxmox_templates_id_seq" OWNED BY "public"."proxmox_templates"."id";
CREATE TABLE IF NOT EXISTS "public"."public_ip_pool_ips" (
    "id" bigint NOT NULL,
    "pool_id" bigint NOT NULL,
    "ip" "text" NOT NULL,
    "created_at" timestamp without time zone
);
ALTER TABLE "public"."public_ip_pool_ips" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."public_ip_pool_ips_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."public_ip_pool_ips_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."public_ip_pool_ips_id_seq" OWNED BY "public"."public_ip_pool_ips"."id";
CREATE TABLE IF NOT EXISTS "public"."public_ip_pools" (
    "id" bigint NOT NULL,
    "host_id" "text" NOT NULL,
    "mac" "text" NOT NULL,
    "label" "text",
    "created_at" timestamp without time zone
);
ALTER TABLE "public"."public_ip_pools" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."public_ip_pools_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."public_ip_pools_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."public_ip_pools_id_seq" OWNED BY "public"."public_ip_pools"."id";
CREATE TABLE IF NOT EXISTS "public"."server_backups" (
    "id" bigint NOT NULL,
    "server_id" bigint NOT NULL,
    "backup_id" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);
ALTER TABLE "public"."server_backups" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."server_backups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."server_backups_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."server_backups_id_seq" OWNED BY "public"."server_backups"."id";
CREATE TABLE IF NOT EXISTS "public"."server_snapshots" (
    "id" bigint NOT NULL,
    "server_id" bigint NOT NULL,
    "snapshot_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."server_snapshots" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."server_snapshots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."server_snapshots_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."server_snapshots_id_seq" OWNED BY "public"."server_snapshots"."id";
CREATE TABLE IF NOT EXISTS "public"."servers" (
    "id" bigint NOT NULL,
    "vmid" integer,
    "node" "text",
    "name" "text" NOT NULL,
    "ip" "inet" NOT NULL,
    "os" "text",
    "location" "text" NOT NULL,
    "cpu_cores" integer NOT NULL,
    "memory_mb" integer NOT NULL,
    "disk_gb" integer NOT NULL,
    "status" "text" DEFAULT 'provisioning'::"text",
    "owner_id" "uuid",
    "owner_email" "text",
    "hourly_cost" numeric(10,4) DEFAULT 0,
    "monthly_cost" numeric(10,4) DEFAULT 0,
    "billing_start" timestamp with time zone,
    "billing_end" timestamp with time zone,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "servers_cpu_cores_check" CHECK (("cpu_cores" >= 1)),
    CONSTRAINT "servers_disk_gb_check" CHECK (("disk_gb" >= 10)),
    CONSTRAINT "servers_memory_mb_check" CHECK (("memory_mb" >= 512)),
    CONSTRAINT "servers_status_check" CHECK (("status" = ANY (ARRAY['provisioning'::"text", 'running'::"text", 'stopped'::"text", 'suspended'::"text", 'failed'::"text", 'error'::"text"])))
);
ALTER TABLE "public"."servers" OWNER TO "postgres";
CREATE SEQUENCE IF NOT EXISTS "public"."servers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."servers_id_seq" OWNER TO "postgres";
ALTER SEQUENCE "public"."servers_id_seq" OWNED BY "public"."servers"."id";
CREATE TABLE IF NOT EXISTS "public"."spectrum_apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spectrum_id" "text" NOT NULL,
    "dns" "jsonb" NOT NULL,
    "tls" "text" DEFAULT 'off'::"text" NOT NULL,
    "edge_ips" "jsonb" NOT NULL,
    "ip_firewall" boolean DEFAULT false NOT NULL,
    "traffic_type" "text" DEFAULT 'direct'::"text" NOT NULL,
    "origin_direct" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "proxy_protocol" "text" DEFAULT 'off'::"text" NOT NULL,
    "protocol" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "spectrum_apps_tls_check" CHECK (("tls" = ANY (ARRAY['off'::"text", 'full'::"text"])))
);
ALTER TABLE "public"."spectrum_apps" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "avatar" "text",
    "display_name" "text",
    "steam" "text",
    "discord" "text",
    "background" "text",
    "bio" "text",
    "suspend" boolean DEFAULT false,
    "roles" "public"."user_role"[] DEFAULT ARRAY['member'::"public"."user_role"],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."user_profiles" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_roles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);
ALTER TABLE "public"."user_roles" OWNER TO "postgres";
COMMENT ON TABLE "public"."user_roles" IS 'User role assignments for admin access';
ALTER TABLE ONLY "public"."game_servers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."game_servers_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."locations_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."otps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."otps_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."project_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_logs_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."proxmox_templates" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."proxmox_templates_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."public_ip_pool_ips" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."public_ip_pool_ips_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."public_ip_pools" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."public_ip_pools_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."server_backups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."server_backups_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."server_snapshots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."server_snapshots_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."servers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."servers_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."clusters"
    ADD CONSTRAINT "clusters_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."database_cluster"
    ADD CONSTRAINT "database_cluster_cluster_id_key" UNIQUE ("cluster_id");
ALTER TABLE ONLY "public"."database_cluster"
    ADD CONSTRAINT "database_cluster_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."database_types"
    ADD CONSTRAINT "database_types_code_key" UNIQUE ("code");
ALTER TABLE ONLY "public"."database_types"
    ADD CONSTRAINT "database_types_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."game_servers"
    ADD CONSTRAINT "game_servers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."github_tokens"
    ADD CONSTRAINT "github_tokens_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."github_tokens"
    ADD CONSTRAINT "github_tokens_user_id_key" UNIQUE ("user_id");
ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."object_spaces"
    ADD CONSTRAINT "object_spaces_bucket_id_key" UNIQUE ("bucket_id");
ALTER TABLE ONLY "public"."object_spaces"
    ADD CONSTRAINT "object_spaces_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."otps"
    ADD CONSTRAINT "otps_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_logs"
    ADD CONSTRAINT "project_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."proxmox_hosts"
    ADD CONSTRAINT "proxmox_hosts_name_key" UNIQUE ("name");
ALTER TABLE ONLY "public"."proxmox_hosts"
    ADD CONSTRAINT "proxmox_hosts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."proxmox_templates"
    ADD CONSTRAINT "proxmox_templates_host_id_vmid_key" UNIQUE ("host_id", "vmid");
ALTER TABLE ONLY "public"."proxmox_templates"
    ADD CONSTRAINT "proxmox_templates_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."public_ip_pool_ips"
    ADD CONSTRAINT "public_ip_pool_ips_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."public_ip_pool_ips"
    ADD CONSTRAINT "public_ip_pool_ips_pool_id_ip_key" UNIQUE ("pool_id", "ip");
ALTER TABLE ONLY "public"."public_ip_pools"
    ADD CONSTRAINT "public_ip_pools_host_id_mac_key" UNIQUE ("host_id", "mac");
ALTER TABLE ONLY "public"."public_ip_pools"
    ADD CONSTRAINT "public_ip_pools_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."server_backups"
    ADD CONSTRAINT "server_backups_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."server_snapshots"
    ADD CONSTRAINT "server_snapshots_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_ip_key" UNIQUE ("ip");
ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."spectrum_apps"
    ADD CONSTRAINT "spectrum_apps_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."spectrum_apps"
    ADD CONSTRAINT "spectrum_apps_spectrum_id_key" UNIQUE ("spectrum_id");
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");
ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");
CREATE INDEX "idx_database_cluster_dbs" ON "public"."database_cluster" USING "gin" ("dbs");
CREATE INDEX "idx_database_cluster_users" ON "public"."database_cluster" USING "gin" ("users");
CREATE INDEX "idx_github_tokens_github_user_id" ON "public"."github_tokens" USING "btree" ("github_user_id");
CREATE INDEX "idx_github_tokens_user_id" ON "public"."github_tokens" USING "btree" ("user_id");
CREATE INDEX "idx_object_spaces_owner_id" ON "public"."object_spaces" USING "btree" ("owner_id");
CREATE INDEX "idx_object_spaces_project_id" ON "public"."object_spaces" USING "btree" ("project_id");
CREATE INDEX "idx_object_spaces_type" ON "public"."object_spaces" USING "btree" ("type");
CREATE INDEX "idx_proxmox_templates_host_id" ON "public"."proxmox_templates" USING "btree" ("host_id");
CREATE INDEX "idx_server_backups_server_id" ON "public"."server_backups" USING "btree" ("server_id");
CREATE INDEX "idx_server_snapshots_server_id" ON "public"."server_snapshots" USING "btree" ("server_id");
CREATE INDEX "idx_servers_location" ON "public"."servers" USING "btree" ("location");
CREATE INDEX "idx_servers_owner_id" ON "public"."servers" USING "btree" ("owner_id");
CREATE INDEX "idx_servers_status" ON "public"."servers" USING "btree" ("status");
CREATE INDEX "idx_servers_vmid" ON "public"."servers" USING "btree" ("vmid", "node");
CREATE INDEX "idx_spectrum_apps_owner" ON "public"."spectrum_apps" USING "btree" ("owner_id");
CREATE INDEX "idx_spectrum_apps_project" ON "public"."spectrum_apps" USING "btree" ("project_id");
CREATE INDEX "idx_spectrum_apps_spectrum_id" ON "public"."spectrum_apps" USING "btree" ("spectrum_id");
CREATE INDEX "idx_spectrum_apps_status" ON "public"."spectrum_apps" USING "btree" ("status");
CREATE OR REPLACE TRIGGER "trg_clusters_updated" BEFORE UPDATE ON "public"."clusters" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "update_servers_updated_at" BEFORE UPDATE ON "public"."servers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_spectrum_apps_updated_at" BEFORE UPDATE ON "public"."spectrum_apps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "user_roles_set_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."clusters"
    ADD CONSTRAINT "clusters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."clusters"
    ADD CONSTRAINT "clusters_owner_id_fkey1" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("id");
ALTER TABLE ONLY "public"."clusters"
    ADD CONSTRAINT "clusters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");
ALTER TABLE ONLY "public"."database_cluster"
    ADD CONSTRAINT "database_cluster_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."database_cluster"
    ADD CONSTRAINT "database_cluster_owner_id_fkey1" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("id");
ALTER TABLE ONLY "public"."database_cluster"
    ADD CONSTRAINT "database_cluster_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");
ALTER TABLE ONLY "public"."game_servers"
    ADD CONSTRAINT "game_servers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");
ALTER TABLE ONLY "public"."game_servers"
    ADD CONSTRAINT "game_servers_plan_fkey" FOREIGN KEY ("plan") REFERENCES "public"."products"("id");
ALTER TABLE ONLY "public"."game_servers"
    ADD CONSTRAINT "game_servers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."game_servers"
    ADD CONSTRAINT "game_servers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."game_servers"
    ADD CONSTRAINT "game_servers_user_id_fkey1" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");
ALTER TABLE ONLY "public"."github_tokens"
    ADD CONSTRAINT "github_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."object_spaces"
    ADD CONSTRAINT "object_spaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."object_spaces"
    ADD CONSTRAINT "object_spaces_owner_id_fkey1" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("id");
ALTER TABLE ONLY "public"."object_spaces"
    ADD CONSTRAINT "object_spaces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_logs"
    ADD CONSTRAINT "project_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_fkey" FOREIGN KEY ("owner") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_fkey1" FOREIGN KEY ("owner") REFERENCES "public"."user_profiles"("id");
ALTER TABLE ONLY "public"."proxmox_templates"
    ADD CONSTRAINT "proxmox_templates_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."proxmox_hosts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."public_ip_pool_ips"
    ADD CONSTRAINT "public_ip_pool_ips_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "public"."public_ip_pools"("id");
ALTER TABLE ONLY "public"."public_ip_pools"
    ADD CONSTRAINT "public_ip_pools_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."proxmox_hosts"("id");
ALTER TABLE ONLY "public"."server_backups"
    ADD CONSTRAINT "server_backups_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."server_snapshots"
    ADD CONSTRAINT "server_snapshots_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_location_fkey" FOREIGN KEY ("location") REFERENCES "public"."proxmox_hosts"("id");
ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."spectrum_apps"
    ADD CONSTRAINT "spectrum_apps_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."spectrum_apps"
    ADD CONSTRAINT "spectrum_apps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
CREATE POLICY "Admins can create proxmox hosts" ON "public"."proxmox_hosts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can delete proxmox hosts" ON "public"."proxmox_hosts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can delete proxmox templates" ON "public"."proxmox_templates" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can delete public ip pool ips" ON "public"."public_ip_pool_ips" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can delete public ip pools" ON "public"."public_ip_pools" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can manage proxmox templates" ON "public"."proxmox_templates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can manage public ip pool ips" ON "public"."public_ip_pool_ips" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can manage public ip pools" ON "public"."public_ip_pools" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can update proxmox hosts" ON "public"."proxmox_hosts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can update proxmox templates" ON "public"."proxmox_templates" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can update public ip pool ips" ON "public"."public_ip_pool_ips" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can update public ip pools" ON "public"."public_ip_pools" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can view all servers" ON "public"."servers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can view proxmox hosts" ON "public"."proxmox_hosts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can view proxmox templates" ON "public"."proxmox_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can view public ip pool ips" ON "public"."public_ip_pool_ips" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Admins can view public ip pools" ON "public"."public_ip_pools" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ('admin'::"public"."user_role" = ANY ("user_profiles"."roles"))))));
CREATE POLICY "Anyone can view locations" ON "public"."locations" FOR SELECT USING (true);
CREATE POLICY "Anyone can view products" ON "public"."products" FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON "public"."activities" FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON "public"."clusters" FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON "public"."database_cluster" FOR SELECT USING (true);
CREATE POLICY "Project owners can delete their projects" ON "public"."projects" FOR DELETE USING (("auth"."uid"() = "owner"));
CREATE POLICY "Project owners can update their projects" ON "public"."projects" FOR UPDATE USING (("auth"."uid"() = "owner"));
CREATE POLICY "Users can create game servers" ON "public"."game_servers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can create projects" ON "public"."projects" FOR INSERT WITH CHECK (("auth"."uid"() = "owner"));
CREATE POLICY "Users can create servers" ON "public"."servers" FOR INSERT WITH CHECK ((("auth"."uid"())::"text" = ("owner_id")::"text"));
CREATE POLICY "Users can create their own object spaces" ON "public"."object_spaces" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can delete their own game servers" ON "public"."game_servers" FOR DELETE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can delete their own object spaces" ON "public"."object_spaces" FOR DELETE USING (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can delete their own servers" ON "public"."servers" FOR DELETE USING ((("auth"."uid"())::"text" = ("owner_id")::"text"));
CREATE POLICY "Users can delete their spectrum apps" ON "public"."spectrum_apps" FOR DELETE USING (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can insert logs for their projects" ON "public"."project_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_logs"."project_id") AND (("auth"."uid"() = "projects"."owner") OR (("auth"."uid"())::"text" IN ( SELECT "jsonb_array_elements_text"("projects"."users") AS "jsonb_array_elements_text")))))));
CREATE POLICY "Users can insert their own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));
CREATE POLICY "Users can insert their spectrum apps" ON "public"."spectrum_apps" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can only access their own GitHub tokens" ON "public"."github_tokens" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update their own game servers" ON "public"."game_servers" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update their own object spaces" ON "public"."object_spaces" FOR UPDATE USING (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can update their own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));
CREATE POLICY "Users can update their own servers" ON "public"."servers" FOR UPDATE USING ((("auth"."uid"())::"text" = ("owner_id")::"text"));
CREATE POLICY "Users can update their spectrum apps" ON "public"."spectrum_apps" FOR UPDATE USING (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can view backups of their servers" ON "public"."server_backups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."servers"
  WHERE (("servers"."id" = "server_backups"."server_id") AND (("auth"."uid"())::"text" = ("servers"."owner_id")::"text")))));
CREATE POLICY "Users can view logs for their projects" ON "public"."project_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_logs"."project_id") AND (("auth"."uid"() = "projects"."owner") OR (("auth"."uid"())::"text" IN ( SELECT "jsonb_array_elements_text"("projects"."users") AS "jsonb_array_elements_text")))))));
CREATE POLICY "Users can view projects they are part of" ON "public"."projects" FOR SELECT USING ((("auth"."uid"() = "owner") OR (("auth"."uid"())::"text" IN ( SELECT "jsonb_array_elements_text"("projects"."users") AS "jsonb_array_elements_text"))));
CREATE POLICY "Users can view snapshots of their servers" ON "public"."server_snapshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."servers"
  WHERE (("servers"."id" = "server_snapshots"."server_id") AND (("auth"."uid"())::"text" = ("servers"."owner_id")::"text")))));
CREATE POLICY "Users can view their own game servers" ON "public"."game_servers" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view their own object spaces" ON "public"."object_spaces" FOR SELECT USING (("auth"."uid"() = "owner_id"));
CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));
CREATE POLICY "Users can view their own role" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view their own servers" ON "public"."servers" FOR SELECT USING ((("auth"."uid"())::"text" = ("owner_id")::"text"));
CREATE POLICY "Users can view their spectrum apps" ON "public"."spectrum_apps" FOR SELECT USING (("auth"."uid"() = "owner_id"));
ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clusters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."database_cluster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_servers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."github_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."object_spaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."server_backups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."server_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."servers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."spectrum_apps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";
GRANT ALL ON TABLE "public"."clusters" TO "anon";
GRANT ALL ON TABLE "public"."clusters" TO "authenticated";
GRANT ALL ON TABLE "public"."clusters" TO "service_role";
GRANT ALL ON TABLE "public"."database_cluster" TO "anon";
GRANT ALL ON TABLE "public"."database_cluster" TO "authenticated";
GRANT ALL ON TABLE "public"."database_cluster" TO "service_role";
GRANT ALL ON TABLE "public"."database_types" TO "anon";
GRANT ALL ON TABLE "public"."database_types" TO "authenticated";
GRANT ALL ON TABLE "public"."database_types" TO "service_role";
GRANT ALL ON TABLE "public"."game_servers" TO "anon";
GRANT ALL ON TABLE "public"."game_servers" TO "authenticated";
GRANT ALL ON TABLE "public"."game_servers" TO "service_role";
GRANT ALL ON SEQUENCE "public"."game_servers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_servers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_servers_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."github_tokens" TO "anon";
GRANT ALL ON TABLE "public"."github_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."github_tokens" TO "service_role";
GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."object_spaces" TO "anon";
GRANT ALL ON TABLE "public"."object_spaces" TO "authenticated";
GRANT ALL ON TABLE "public"."object_spaces" TO "service_role";
GRANT ALL ON TABLE "public"."otps" TO "anon";
GRANT ALL ON TABLE "public"."otps" TO "authenticated";
GRANT ALL ON TABLE "public"."otps" TO "service_role";
GRANT ALL ON SEQUENCE "public"."otps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."otps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."otps_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";
GRANT ALL ON TABLE "public"."project_logs" TO "anon";
GRANT ALL ON TABLE "public"."project_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."project_logs" TO "service_role";
GRANT ALL ON SEQUENCE "public"."project_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_logs_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";
GRANT ALL ON TABLE "public"."proxmox_hosts" TO "anon";
GRANT ALL ON TABLE "public"."proxmox_hosts" TO "authenticated";
GRANT ALL ON TABLE "public"."proxmox_hosts" TO "service_role";
GRANT ALL ON TABLE "public"."proxmox_templates" TO "anon";
GRANT ALL ON TABLE "public"."proxmox_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."proxmox_templates" TO "service_role";
GRANT ALL ON SEQUENCE "public"."proxmox_templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proxmox_templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proxmox_templates_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."public_ip_pool_ips" TO "anon";
GRANT ALL ON TABLE "public"."public_ip_pool_ips" TO "authenticated";
GRANT ALL ON TABLE "public"."public_ip_pool_ips" TO "service_role";
GRANT ALL ON SEQUENCE "public"."public_ip_pool_ips_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."public_ip_pool_ips_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."public_ip_pool_ips_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."public_ip_pools" TO "anon";
GRANT ALL ON TABLE "public"."public_ip_pools" TO "authenticated";
GRANT ALL ON TABLE "public"."public_ip_pools" TO "service_role";
GRANT ALL ON SEQUENCE "public"."public_ip_pools_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."public_ip_pools_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."public_ip_pools_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."server_backups" TO "anon";
GRANT ALL ON TABLE "public"."server_backups" TO "authenticated";
GRANT ALL ON TABLE "public"."server_backups" TO "service_role";
GRANT ALL ON SEQUENCE "public"."server_backups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."server_backups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."server_backups_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."server_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."server_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."server_snapshots" TO "service_role";
GRANT ALL ON SEQUENCE "public"."server_snapshots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."server_snapshots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."server_snapshots_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."servers" TO "anon";
GRANT ALL ON TABLE "public"."servers" TO "authenticated";
GRANT ALL ON TABLE "public"."servers" TO "service_role";
GRANT ALL ON SEQUENCE "public"."servers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."servers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."servers_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."spectrum_apps" TO "anon";
GRANT ALL ON TABLE "public"."spectrum_apps" TO "authenticated";
GRANT ALL ON TABLE "public"."spectrum_apps" TO "service_role";
GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
RESET ALL;
