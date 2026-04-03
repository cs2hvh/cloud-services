import { createServiceClient } from "../server";
import { AIAgents } from "./ai_agents";
import { Clusters } from "./clusters";
import { Database_Clusters } from "./database_clusters";
import { GameServers } from "./gameservers";
import { ObjectSpaces } from "./object_spaces";
import { Platform_Apps } from "./platform_apps";
import { Spectrum_Apps } from "./spectrum_apps";
import {
  SUPPORT_OPEN_STATUSES,
  getSupportTopicById,
  getSupportTopicLabels,
  SupportResourceOption,
  SupportTicketStatus,
} from "@/lib/support/catalog";

export interface SupportTicketSummary {
  id: string;
  ticket_number: string;
  status: SupportTicketStatus;
  topic: string;
  sub_topic: string;
  tertiary_topic: string;
  subject: string;
  affected_resource_type: string | null;
  affected_resource_id: string | null;
  affected_resource_name: string | null;
  created_at: string;
  updated_at: string;
  latest_message_at: string;
  resolved_at: string | null;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  actor_type: "user" | "admin" | "system";
  message: string;
  created_at: string;
  author: SupportTicketOwnerSummary | null;
}

export interface SupportTicketAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  description: string;
  messages: SupportTicketMessage[];
  attachments: SupportTicketAttachment[];
}

export interface SupportTicketOwnerSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  avatar: string | null;
}

export interface AdminSupportTicketSummary extends SupportTicketSummary {
  owner_id: string;
  owner: SupportTicketOwnerSummary | null;
}

export interface AdminSupportTicketDetail extends SupportTicketDetail {
  owner_id: string;
  owner: SupportTicketOwnerSummary | null;
}

export interface SupportTicketAdminListInput {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus | "all";
  topic?: string;
  search?: string;
}

export interface SupportTicketAdminListResult {
  tickets: AdminSupportTicketSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SupportTicketCreateInput {
  ownerId: string;
  topic: string;
  subTopic: string;
  tertiaryTopic: string;
  subject: string;
  description: string;
  affectedResourceType?: string | null;
  affectedResourceId?: string | null;
  affectedResourceName?: string | null;
}

export interface SupportTicketUpdateInput {
  topic?: string;
  subTopic?: string;
  tertiaryTopic?: string;
  subject?: string;
  description?: string;
  affectedResourceType?: string | null;
  affectedResourceId?: string | null;
  affectedResourceName?: string | null;
}

export interface SupportAttachmentInsertInput {
  ticketId: string;
  messageId?: string | null;
  uploadedBy: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
}

export interface SupportAttachmentDeleteResult {
  id: string;
  file_path: string;
}

const BILLING_RESOURCES: SupportResourceOption[] = [
  { id: "wallet", name: "Wallet balance", type: "billing" },
  { id: "topup", name: "One-time top-up", type: "billing" },
  { id: "recurring_topup", name: "Recurring top-up", type: "billing" },
  { id: "coupons", name: "Coupons & promocodes", type: "billing" },
  { id: "transactions", name: "Transaction history", type: "billing" },
];

const FIREWALL_RESOURCES: SupportResourceOption[] = [
  { id: "firewall_rules", name: "Firewall rule set", type: "firewall" },
  { id: "firewall_allowlist", name: "Allowlist/Denylist", type: "firewall" },
  { id: "firewall_nat", name: "NAT / Port forwarding", type: "firewall" },
];

function sortResourceOptions(options: SupportResourceOption[]): SupportResourceOption[] {
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
}

async function getSupportDb() {
  const supabase = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).schema("support");
}

async function getOwnerProfiles(ownerIds: string[]): Promise<Map<string, SupportTicketOwnerSummary>> {
  const uniqueOwnerIds = Array.from(new Set(ownerIds)).filter(Boolean);
  if (uniqueOwnerIds.length === 0) {
    return new Map<string, SupportTicketOwnerSummary>();
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, username, display_name, avatar")
    .in("id", uniqueOwnerIds);

  if (error) {
    console.error("[SupportTickets] getOwnerProfiles failed:", error.message);
    return new Map<string, SupportTicketOwnerSummary>();
  }

  const { data: authUsersData, error: authUsersError } = await supabase.auth.admin.listUsers();
  if (authUsersError) {
    console.error("[SupportTickets] getOwnerProfiles auth users failed:", authUsersError.message);
  }
  const emailMap = new Map<string, string | null>(
    (authUsersData?.users ?? []).map((user) => [user.id, user.email ?? null])
  );

  const map = new Map<string, SupportTicketOwnerSummary>();
  (data ?? []).forEach((profile) => {
    map.set(profile.id, {
      id: profile.id,
      username: profile.username ?? null,
      display_name: profile.display_name ?? null,
      email: emailMap.get(profile.id) ?? null,
      avatar: profile.avatar ?? null,
    });
  });

  return map;
}

export const SupportTickets = {
  async listByUser(
    userId: string,
    status?: SupportTicketStatus | SupportTicketStatus[]
  ): Promise<SupportTicketSummary[]> {
    const supportDb = await getSupportDb();
    let query = supportDb
      .from("support_tickets")
      .select(
        "id, ticket_number, status, topic, sub_topic, tertiary_topic, subject, affected_resource_type, affected_resource_id, affected_resource_name, created_at, updated_at, latest_message_at, resolved_at"
      )
      .eq("owner_id", userId)
      .order("latest_message_at", { ascending: false });

    if (Array.isArray(status) && status.length > 0) {
      query = query.in("status", status);
    } else if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[SupportTickets] listByUser failed:", error.message);
      return [];
    }

    return (data ?? []) as SupportTicketSummary[];
  },

  async getByIdForUser(userId: string, ticketId: string): Promise<SupportTicketDetail | null> {
    const supportDb = await getSupportDb();

    const { data: ticket, error: ticketError } = await supportDb
      .from("support_tickets")
      .select(
        "id, ticket_number, status, topic, sub_topic, tertiary_topic, subject, description, affected_resource_type, affected_resource_id, affected_resource_name, created_at, updated_at, latest_message_at, resolved_at"
      )
      .eq("id", ticketId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (ticketError) {
      console.error("[SupportTickets] getByIdForUser failed:", ticketError.message);
      return null;
    }

    if (!ticket) {
      return null;
    }

    const [{ data: messages, error: messagesError }, { data: attachments, error: attachmentsError }] =
      await Promise.all([
        supportDb
          .from("support_ticket_messages")
          .select("id, ticket_id, author_id, actor_type, message, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        supportDb
          .from("support_ticket_attachments")
          .select("id, ticket_id, message_id, uploaded_by, file_name, file_path, mime_type, file_size, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
      ]);

    if (messagesError) {
      console.error("[SupportTickets] get messages failed:", messagesError.message);
    }
    if (attachmentsError) {
      console.error("[SupportTickets] get attachments failed:", attachmentsError.message);
    }

    const typedMessages = (messages ?? []) as Array<Omit<SupportTicketMessage, "author">>;

    const authorProfiles = await getOwnerProfiles(
      typedMessages
        .map((message) => message.author_id)
        .filter((authorId): authorId is string => Boolean(authorId))
    );

    return {
      ...(ticket as Omit<SupportTicketDetail, "messages" | "attachments">),
      messages: typedMessages.map((message) => ({
        ...message,
        author: message.author_id ? authorProfiles.get(message.author_id) || null : null,
      })) as SupportTicketMessage[],
      attachments: (attachments ?? []) as SupportTicketAttachment[],
    };
  },

  async listForAdmin(input: SupportTicketAdminListInput = {}): Promise<SupportTicketAdminListResult> {
    const supportDb = await getSupportDb();
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const searchTerm = (input.search ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9@._\-\s]/g, " ")
      .replaceAll(",", " ");

    let query = supportDb
      .from("support_tickets")
      .select(
        "id, ticket_number, status, topic, sub_topic, tertiary_topic, subject, affected_resource_type, affected_resource_id, affected_resource_name, created_at, updated_at, latest_message_at, resolved_at, owner_id",
        { count: "exact" }
      )
      .order("latest_message_at", { ascending: false })
      .range(from, to);

    if (input.status && input.status !== "all") {
      query = query.eq("status", input.status);
    }

    if (input.topic && input.topic !== "all") {
      query = query.eq("topic", input.topic);
    }

    if (searchTerm.length > 0) {
      query = query.or(
        `ticket_number.ilike.%${searchTerm}%,subject.ilike.%${searchTerm}%,owner_id.ilike.%${searchTerm}%,affected_resource_name.ilike.%${searchTerm}%`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[SupportTickets] listForAdmin failed:", error.message);
      return {
        tickets: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    type AdminTicketListRow = Omit<AdminSupportTicketSummary, "owner">;
    const typedData = (data ?? []) as AdminTicketListRow[];
    const ownerProfiles = await getOwnerProfiles(typedData.map((ticket) => ticket.owner_id));
    const tickets = typedData.map((ticket) => ({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: ticket.status as SupportTicketStatus,
      topic: ticket.topic,
      sub_topic: ticket.sub_topic,
      tertiary_topic: ticket.tertiary_topic,
      subject: ticket.subject,
      affected_resource_type: ticket.affected_resource_type,
      affected_resource_id: ticket.affected_resource_id,
      affected_resource_name: ticket.affected_resource_name,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      latest_message_at: ticket.latest_message_at,
      resolved_at: ticket.resolved_at,
      owner_id: ticket.owner_id,
      owner: ownerProfiles.get(ticket.owner_id) || null,
    })) as AdminSupportTicketSummary[];

    const total = count ?? 0;
    return {
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getByIdForAdmin(ticketId: string): Promise<AdminSupportTicketDetail | null> {
    const supportDb = await getSupportDb();

    const { data: ticket, error: ticketError } = await supportDb
      .from("support_tickets")
      .select(
        "id, ticket_number, status, topic, sub_topic, tertiary_topic, subject, description, affected_resource_type, affected_resource_id, affected_resource_name, created_at, updated_at, latest_message_at, resolved_at, owner_id"
      )
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      console.error("[SupportTickets] getByIdForAdmin failed:", ticketError.message);
      return null;
    }
    if (!ticket) {
      return null;
    }

    const [{ data: messages, error: messagesError }, { data: attachments, error: attachmentsError }] =
      await Promise.all([
        supportDb
          .from("support_ticket_messages")
          .select("id, ticket_id, author_id, actor_type, message, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        supportDb
          .from("support_ticket_attachments")
          .select("id, ticket_id, message_id, uploaded_by, file_name, file_path, mime_type, file_size, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
      ]);

    if (messagesError) {
      console.error("[SupportTickets] getByIdForAdmin messages failed:", messagesError.message);
    }
    if (attachmentsError) {
      console.error("[SupportTickets] getByIdForAdmin attachments failed:", attachmentsError.message);
    }

    const ownerProfiles = await getOwnerProfiles([ticket.owner_id]);

    const typedMessages = (messages ?? []) as Array<Omit<SupportTicketMessage, "author">>;

    const authorProfiles = await getOwnerProfiles(
      typedMessages
        .map((message) => message.author_id)
        .filter((authorId): authorId is string => Boolean(authorId))
    );

    return {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: ticket.status as SupportTicketStatus,
      topic: ticket.topic,
      sub_topic: ticket.sub_topic,
      tertiary_topic: ticket.tertiary_topic,
      subject: ticket.subject,
      description: ticket.description,
      affected_resource_type: ticket.affected_resource_type,
      affected_resource_id: ticket.affected_resource_id,
      affected_resource_name: ticket.affected_resource_name,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      latest_message_at: ticket.latest_message_at,
      resolved_at: ticket.resolved_at,
      owner_id: ticket.owner_id,
      owner: ownerProfiles.get(ticket.owner_id) || null,
      messages: typedMessages.map((message) => ({
        ...message,
        author: message.author_id ? authorProfiles.get(message.author_id) || null : null,
      })) as SupportTicketMessage[],
      attachments: (attachments ?? []) as SupportTicketAttachment[],
    };
  },

  async addMessage(input: {
    ticketId: string;
    actorType: "user" | "admin" | "system";
    message: string;
    authorId?: string | null;
  }): Promise<SupportTicketMessage | null> {
    const supportDb = await getSupportDb();
    const { data, error } = await supportDb
      .from("support_ticket_messages")
      .insert({
        ticket_id: input.ticketId,
        author_id: input.authorId ?? null,
        actor_type: input.actorType,
        message: input.message,
      })
      .select("id, ticket_id, author_id, actor_type, message, created_at")
      .maybeSingle();

    if (error) {
      console.error("[SupportTickets] addMessage failed:", error.message);
      return null;
    }
    const message = data as Omit<SupportTicketMessage, "author"> | null;
    if (!message) return null;

    const authorProfiles = await getOwnerProfiles(
      message.author_id ? [message.author_id] : []
    );

    return {
      ...message,
      author: message.author_id ? authorProfiles.get(message.author_id) || null : null,
    } as SupportTicketMessage;
  },

  async updateStatusByAdmin(ticketId: string, status: SupportTicketStatus): Promise<boolean> {
    const supportDb = await getSupportDb();
    const updatePayload =
      status === "resolved" || status === "closed" || status === "cancelled"
        ? { status, resolved_at: new Date().toISOString() }
        : { status, resolved_at: null };

    const { error } = await supportDb
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", ticketId);

    if (error) {
      console.error("[SupportTickets] updateStatusByAdmin failed:", error.message);
      return false;
    }
    return true;
  },

  async updateStatusByUser(
    userId: string,
    ticketId: string,
    status: SupportTicketStatus
  ): Promise<boolean> {
    const supportDb = await getSupportDb();
    const updatePayload =
      status === "resolved" || status === "closed" || status === "cancelled"
        ? { status, resolved_at: new Date().toISOString() }
        : { status, resolved_at: null };

    const { error } = await supportDb
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", ticketId)
      .eq("owner_id", userId);

    if (error) {
      console.error("[SupportTickets] updateStatusByUser failed:", error.message);
      return false;
    }
    return true;
  },

  async create(input: SupportTicketCreateInput): Promise<{ ticket: SupportTicketSummary; messageId: string | null } | null> {
    const supportDb = await getSupportDb();

    const { data: ticket, error: ticketError } = await supportDb
      .from("support_tickets")
      .insert({
        owner_id: input.ownerId,
        status: "open",
        topic: input.topic,
        sub_topic: input.subTopic,
        tertiary_topic: input.tertiaryTopic,
        subject: input.subject,
        description: input.description,
        affected_resource_type: input.affectedResourceType ?? null,
        affected_resource_id: input.affectedResourceId ?? null,
        affected_resource_name: input.affectedResourceName ?? null,
      })
      .select(
        "id, ticket_number, status, topic, sub_topic, tertiary_topic, subject, affected_resource_type, affected_resource_id, affected_resource_name, created_at, updated_at, latest_message_at, resolved_at"
      )
      .single();

    if (ticketError) {
      console.error("[SupportTickets] create ticket failed:", ticketError.message);
      return null;
    }

    const { data: message, error: messageError } = await supportDb
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        author_id: input.ownerId,
        actor_type: "user",
        message: input.description,
      })
      .select("id")
      .maybeSingle();

    if (messageError) {
      console.error("[SupportTickets] create initial message failed:", messageError.message);
    }

    return {
      ticket: ticket as SupportTicketSummary,
      messageId: message?.id ?? null,
    };
  },

  async updateByUser(
    userId: string,
    ticketId: string,
    patch: SupportTicketUpdateInput
  ): Promise<SupportTicketSummary | null> {
    const supportDb = await getSupportDb();
    const updatePayload: Record<string, string | null> = {};

    if (patch.topic !== undefined) updatePayload.topic = patch.topic;
    if (patch.subTopic !== undefined) updatePayload.sub_topic = patch.subTopic;
    if (patch.tertiaryTopic !== undefined) updatePayload.tertiary_topic = patch.tertiaryTopic;
    if (patch.subject !== undefined) updatePayload.subject = patch.subject;
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.affectedResourceType !== undefined) updatePayload.affected_resource_type = patch.affectedResourceType;
    if (patch.affectedResourceId !== undefined) updatePayload.affected_resource_id = patch.affectedResourceId;
    if (patch.affectedResourceName !== undefined) updatePayload.affected_resource_name = patch.affectedResourceName;

    const { data, error } = await supportDb
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", ticketId)
      .eq("owner_id", userId)
      .in("status", SUPPORT_OPEN_STATUSES)
      .select(
        "id, ticket_number, status, topic, sub_topic, tertiary_topic, subject, affected_resource_type, affected_resource_id, affected_resource_name, created_at, updated_at, latest_message_at, resolved_at"
      )
      .maybeSingle();

    if (error) {
      console.error("[SupportTickets] updateByUser failed:", error.message);
      return null;
    }

    return (data as SupportTicketSummary | null) ?? null;
  },

  async addAttachments(attachments: SupportAttachmentInsertInput[]): Promise<boolean> {
    if (attachments.length === 0) return true;
    const supportDb = await getSupportDb();

    const { error } = await supportDb.from("support_ticket_attachments").insert(
      attachments.map((item) => ({
        ticket_id: item.ticketId,
        message_id: item.messageId ?? null,
        uploaded_by: item.uploadedBy,
        file_name: item.fileName,
        file_path: item.filePath,
        mime_type: item.mimeType,
        file_size: item.fileSize,
      }))
    );

    if (error) {
      console.error("[SupportTickets] addAttachments failed:", error.message);
      return false;
    }
    return true;
  },

  async deleteAttachmentByUser(
    userId: string,
    ticketId: string,
    attachmentId: string
  ): Promise<SupportAttachmentDeleteResult | null> {
    const supportDb = await getSupportDb();
    const { data, error } = await supportDb
      .from("support_ticket_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("ticket_id", ticketId)
      .eq("uploaded_by", userId)
      .select("id, file_path")
      .maybeSingle();

    if (error) {
      console.error("[SupportTickets] deleteAttachmentByUser failed:", error.message);
      return null;
    }
    return (data as SupportAttachmentDeleteResult | null) ?? null;
  },

  async listAffectedResources(userId: string, topicId: string): Promise<SupportResourceOption[]> {
    const topic = getSupportTopicById(topicId);
    if (!topic) return [];

    const fallback = [
      {
        id: "general",
        name: `General ${topic.label} issue`,
        type: topic.resourceType,
      },
    ];

    try {
      let dynamicResources: SupportResourceOption[] = [];
      if (topic.resourceType === "vps" || topic.resourceType === "bare_metal") {
        const supabase = await createServiceClient();
        const { data } = await supabase
          .from("servers")
          .select("id, name, status")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false });
        dynamicResources = (data ?? []).map((server: { id: number; name: string; status: string | null }) => ({
          id: String(server.id),
          name: server.name,
          type: topic.resourceType,
          status: server.status,
        }));
      } else if (topic.resourceType === "database") {
        const dbs = await Database_Clusters.read_all_owner_id(userId);
        dynamicResources = dbs.map((db) => ({
          id: db.cluster_id ? String(db.cluster_id) : db.id ? String(db.id) : db.name,
          name: db.name,
          type: "database",
          status: db.status,
        }));
      } else if (topic.resourceType === "app_platform") {
        const apps = await Platform_Apps.list_by_owner(userId);
        dynamicResources = apps.map((app) => ({
          id: app.id,
          name: app.name,
          type: "app_platform",
          status: app.status,
        }));
      } else if (topic.resourceType === "kubernetes") {
        const clusters = await Clusters.get_by_user_id(userId);
        dynamicResources = clusters.map((cluster) => ({
          id: cluster.cluster_id,
          name: cluster.cluster_name,
          type: "kubernetes",
          status: cluster.status,
        }));
      } else if (topic.resourceType === "game_server") {
        const servers = await GameServers.get_by_user(userId);
        dynamicResources = servers.map((server) => ({
          id: String(server.id),
          name: server.name,
          type: "game_server",
          status: server.status,
        }));
      } else if (topic.resourceType === "spectrum") {
        const apps = await Spectrum_Apps.list_by_owner(userId);
        dynamicResources = apps.map((app) => ({
          id: app.spectrum_id,
          name: app.dns?.original_name || app.spectrum_id,
          type: "spectrum",
          status: app.status,
        }));
      } else if (topic.resourceType === "object_storage") {
        const buckets = await ObjectSpaces.get_buckets(userId);
        dynamicResources = buckets.map((bucket) => ({
          id: bucket.id ?? bucket.name,
          name: bucket.name,
          type: "object_storage",
          status: bucket.status,
        }));
      } else if (topic.resourceType === "ai_agent") {
        const agents = await AIAgents.list_by_user(userId);
        dynamicResources = agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          type: "ai_agent",
          status: agent.status,
        }));
      } else if (topic.resourceType === "domain") {
        const supabase = await createServiceClient();
        const [{ data: platformDomains }, { data: purchaseRequests }] = await Promise.all([
          supabase
            .from("platform_app_domains")
            .select("id, domain, status")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("domain_purchase_requests")
            .select("id, domain, status")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
        ]);

        const domainMap = new Map<string, SupportResourceOption>();
        (platformDomains ?? []).forEach((domain: { id: string; domain: string; status: string | null }) => {
          domainMap.set(`platform:${domain.id}`, {
            id: `platform:${domain.id}`,
            name: domain.domain,
            type: "domain",
            status: domain.status,
          });
        });
        (purchaseRequests ?? []).forEach((domain: { id: string; domain: string; status: string | null }) => {
          domainMap.set(`purchase:${domain.id}`, {
            id: `purchase:${domain.id}`,
            name: `${domain.domain} (purchase request)`,
            type: "domain",
            status: domain.status,
          });
        });
        dynamicResources = Array.from(domainMap.values());
      } else if (topic.resourceType === "billing") {
        dynamicResources = BILLING_RESOURCES;
      } else if (topic.resourceType === "firewall") {
        dynamicResources = FIREWALL_RESOURCES;
      }

      return [...fallback, ...sortResourceOptions(dynamicResources)];
    } catch (error) {
      console.error("[SupportTickets] listAffectedResources failed:", error);
      return fallback;
    }
  },

  getTopicPathLabel(ticket: Pick<SupportTicketSummary, "topic" | "sub_topic" | "tertiary_topic">): string {
    const labels = getSupportTopicLabels(ticket.topic, ticket.sub_topic, ticket.tertiary_topic);
    if (!labels) {
      return `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`;
    }
    return `${labels.topicLabel} / ${labels.subTopicLabel} / ${labels.tertiaryTopicLabel}`;
  },
};
