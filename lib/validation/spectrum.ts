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
  original_name: z.string().optional(),
});

// Edge IPs configuration (required)
export const spectrumEdgeIpsSchema = z.object({
  type: z.string().min(1, "Edge IP type is required"),
  connectivity: z.string().min(1, "Connectivity type is required"),
}).optional().default({connectivity:"all",type:"dynamic"});

// protocol like tcp/22 or udp/27015 or a range (tcp/1000-2000)
export const spectrumProtocolSchema = z
  .string()
  .regex(/^(tcp|udp)\/(\d{1,5})(-\d{1,5})?$/, "Protocol must be tcp|udp with a port or port range, e.g. 'tcp/22'");

// Create payload
export const createSpectrumAppSchema = z.object({
  project_id: z.string().uuid("project_id must be a valid UUID"),
  owner_id: z.string().uuid("owner_id must be a valid UUID"),
  dns: spectrumDNSchema,
  protocol: spectrumProtocolSchema,
  origin_direct: z.array(z.string()).min(1, "At least one origin is required"),
  tls: z.enum(["off", "full"], {
    errorMap: () => ({ message: "TLS must be 'off' or 'full'" }),
  }).default("off"),
  edge_ips: spectrumEdgeIpsSchema,
  ip_firewall: z.boolean().default(false),
  traffic_type: z.string().default("direct"),
  proxy_protocol: z.string().default("off"),
});

export type CreateSpectrumAppPayload = z.infer<typeof createSpectrumAppSchema>;

export const updateSpectrumAppSchema = z.object({
  app_id: z.string().min(1, "app_id is required"),
  dns: spectrumDNSchema.optional(),
  protocol: spectrumProtocolSchema.optional(),
  origin_direct: z.array(z.string()).optional(),
  tls: z.enum(["off", "full"]).optional(),
  edge_ips: spectrumEdgeIpsSchema.optional(),
  ip_firewall: z.boolean().optional(),
  traffic_type: z.string().optional(),
  proxy_protocol: z.string().optional(),
});

export type UpdateSpectrumAppPayload = z.infer<typeof updateSpectrumAppSchema>;

export const deleteSpectrumAppSchema = z.object({
  app_id: z.string().min(1, "app_id is required"),
});

export type DeleteSpectrumAppPayload = z.infer<typeof deleteSpectrumAppSchema>;

export const getSpectrumAppSchema = z.object({
  app_id: z.string().min(1, "app_id is required"),
});

export type GetSpectrumAppPayload = z.infer<typeof getSpectrumAppSchema>;
