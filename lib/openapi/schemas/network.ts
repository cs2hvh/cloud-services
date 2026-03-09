import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

export const SpectrumAppSchema = z.object({
  id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
  dns_name: z.string().nullable().openapi({ example: 'api.example.com', description: 'DNS name for the Spectrum app' }),
  protocol: z.string().openapi({ example: 'tcp/443', description: 'Protocol and port (e.g., tcp/443, udp/27015)' }),
  origin_direct: z.array(z.string()).openapi({ example: ['203.0.113.1:443'], description: 'Origin servers' }),
  tls: z.enum(['off', 'full', 'strict', 'flexible']).openapi({ example: 'full', description: 'TLS mode' }),
  ip_firewall: z.boolean().openapi({ example: false, description: 'IP firewall enabled' }),
  traffic_type: z.string().openapi({ example: 'direct', description: 'Traffic type' }),
  proxy_protocol: z.string().openapi({ example: 'off', description: 'PROXY protocol mode' }),
  status: z.string().openapi({ example: 'created', description: 'App status' }),
  cloudflare_status: z.string().optional().openapi({ example: 'active', description: 'Cloudflare sync status' }),
  created_at: z.string().datetime().openapi({ example: '2026-02-27T10:00:00Z' }),
  updated_at: z.string().datetime().optional().openapi({ example: '2026-02-27T12:00:00Z' }),
}).openapi('SpectrumApp');

export const CreateSpectrumAppRequestSchema = z.object({
  project_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'Project UUID' }),
  dns: z.object({
    name: z.string().openapi({ example: 'api', description: 'DNS subdomain' }),
    type: z.enum(['A', 'CNAME']).openapi({ example: 'CNAME', description: 'DNS record type' }),
  }).openapi({ description: 'DNS configuration' }),
  protocol: z.string().openapi({ example: 'tcp/443', description: 'Protocol and port' }),
  origin_direct: z.array(z.string()).openapi({ example: ['203.0.113.1:443'], description: 'Origin servers' }),
  tls: z.enum(['off', 'full']).optional().openapi({ example: 'full', description: 'TLS mode' }),
  edge_ips: z.object({
    type: z.string().optional().openapi({ example: 'dynamic' }),
    connectivity: z.string().optional().openapi({ example: 'all' }),
  }).optional().openapi({ description: 'Edge IPs configuration' }),
  ip_firewall: z.boolean().optional().openapi({ example: false }),
  traffic_type: z.string().optional().openapi({ example: 'direct' }),
  proxy_protocol: z.string().optional().openapi({ example: 'off' }),
}).openapi('CreateSpectrumAppRequest');

export const UpdateSpectrumAppRequestSchema = z.object({
  dns: z.object({
    name: z.string(),
    type: z.enum(['A', 'CNAME']),
  }).optional().openapi({ description: 'DNS configuration' }),
  protocol: z.string().optional().openapi({ example: 'tcp/443', description: 'Protocol and port' }),
  origin_direct: z.array(z.string()).optional().openapi({ example: ['203.0.113.1:443'] }),
  tls: z.enum(['off', 'full', 'strict', 'flexible']).optional().openapi({ example: 'full', description: 'TLS mode' }),
  edge_ips: z.object({
    type: z.string().optional(),
    connectivity: z.string().optional(),
  }).optional().openapi({ description: 'Edge IPs configuration' }),
  ip_firewall: z.boolean().optional(),
  traffic_type: z.string().optional(),
  proxy_protocol: z.string().optional(),
  argo_smart_routing: z.boolean().optional().openapi({ description: 'Enable Argo Smart Routing' }),
}).openapi('UpdateSpectrumAppRequest');

export const SpectrumAppResponseSchema = z.object({
  data: SpectrumAppSchema,
}).openapi('SpectrumAppResponse');

export const SpectrumAppListResponseSchema = z.object({
  data: z.array(SpectrumAppSchema),
  meta: PaginationMetaSchema,
}).openapi('SpectrumAppListResponse');

export const SpectrumAppDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    message: z.string().openapi({ example: 'Spectrum app deleted successfully' }),
  }),
}).openapi('SpectrumAppDeleteResponse');
