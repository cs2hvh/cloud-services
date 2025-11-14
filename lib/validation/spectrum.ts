import { z } from "zod";
import { NAMING_RULES } from "./constants";

// DNS record for Spectrum app hostname
export const spectrumDNSchema = z.object({
  name: z
    .string()
    .min(NAMING_RULES.MIN_CLUSTER_NAME_LENGTH)
    .max(NAMING_RULES.MAX_CLUSTER_NAME_LENGTH),
  type: z.enum(["A", "CNAME"], {
    errorMap: () => ({ message: "DNS type must be 'A' or 'CNAME'" }),
  }),
});

// Origin via DNS name (requires origin_port)
export const spectrumOriginDnsSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["A", "AAAA", "CNAME"]),
});

// Edge IPs configuration (optional)
export const spectrumEdgeIpsSchema = z.object({
  type: z.enum(["dynamic", "static"]),
  connectivity: z.enum(["all", "closer", "region"]).optional(),
  ips: z.array(z.string()).optional(),
});

// protocol like tcp/22 or udp/27015 or a range (tcp/1000-2000)
export const spectrumProtocolSchema = z
  .string()
  .regex(/^(tcp|udp)\/(\d{1,5})(-\d{1,5})?$/, "Protocol must be tcp|udp with a port or port range, e.g. 'tcp/22'");

// Create payload: requires either origin_direct OR (origin_dns + origin_port)
export const createSpectrumAppSchema = z
  .object({
    project_id: z.string().uuid("project_id must be a valid UUID"),
    owner_id: z.string().uuid("owner_id must be a valid UUID"),
    dns: spectrumDNSchema,
    protocol: spectrumProtocolSchema,

    // One of the origin definitions
    origin_direct: z.array(z.string()).optional(), // entries like "203.0.113.10:22"
    origin_dns: spectrumOriginDnsSchema.optional(),
    origin_port: z.union([z.number().int().min(1).max(65535), z.string()]).optional(),

    // Optional flags
    ip_firewall: z.boolean().optional(),
    tls: z.enum(["off", "passthrough", "offload"]).optional(),
    traffic_type: z.enum(["direct", "http"]).optional(),
    edge_ips: spectrumEdgeIpsSchema.optional(),
  })
  .refine(
    (v) => {
      const hasDirect = Array.isArray(v.origin_direct) && v.origin_direct.length > 0;
      const hasDns = !!v.origin_dns && !!v.origin_port;
      return hasDirect !== hasDns; // exactly one must be provided
    },
    {
      message: "Provide exactly one origin: either 'origin_direct' or both 'origin_dns' and 'origin_port'",
      path: ["origin_direct"],
    },
  );

export type CreateSpectrumAppPayload = z.infer<typeof createSpectrumAppSchema>;

export const updateSpectrumAppSchema = z
  .object({
    app_id: z.string().min(1, "app_id is required"),
    dns: spectrumDNSchema.optional(),
    protocol: spectrumProtocolSchema.optional(),
    origin_direct: z.array(z.string()).optional(),
    origin_dns: spectrumOriginDnsSchema.optional(),
    origin_port: z.union([z.number().int().min(1).max(65535), z.string()]).optional(),
    ip_firewall: z.boolean().optional(),
    tls: z.enum(["off", "passthrough", "offload"]).optional(),
    traffic_type: z.enum(["direct", "http"]).optional(),
    edge_ips: spectrumEdgeIpsSchema.optional(),
  })
  .refine(
    (v) => {
      // If origin fields are present, the same exclusivity applies
      const hasDirect = Array.isArray(v.origin_direct) && v.origin_direct.length > 0;
      const hasDns = !!v.origin_dns && !!v.origin_port;
      return !(hasDirect && hasDns);
    },
    {
      message: "If updating origin, provide either 'origin_direct' or ('origin_dns' + 'origin_port')",
      path: ["origin_direct"],
    },
  );

export type UpdateSpectrumAppPayload = z.infer<typeof updateSpectrumAppSchema>;

export const deleteSpectrumAppSchema = z.object({
  app_id: z.string().min(1, "app_id is required"),
});

export type DeleteSpectrumAppPayload = z.infer<typeof deleteSpectrumAppSchema>;

export const getSpectrumAppSchema = z.object({
  app_id: z.string().min(1, "app_id is required"),
});

export type GetSpectrumAppPayload = z.infer<typeof getSpectrumAppSchema>;
