import { z } from "zod";
import { getSupportTopicById, isValidSupportTopic } from "@/lib/support/catalog";
import { getSupportRichTextLength } from "@/lib/support/richtext";

export const supportTicketStatusSchema = z.enum([
  "open",
  "in_progress",
  "pending",
  "resolved",
  "closed",
  "cancelled",
  "permantly_close",
]);

const optionalNullableTrimmedString = z.string().min(1).max(255).nullable().optional();

const descriptionSchema = z
  .string()
  .refine((value) => getSupportRichTextLength(value) >= 10, {
    message: "Issue description must be at least 10 characters",
  })
  .refine((value) => getSupportRichTextLength(value) <= 8000, {
    message: "Issue description cannot exceed 8000 characters",
  });

export const supportTicketListQuerySchema = z.object({
  status: supportTicketStatusSchema.optional(),
});

export const supportResourcesQuerySchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, "Topic is required")
    .refine((value) => Boolean(getSupportTopicById(value)), { message: "Invalid topic" }),
});

export const createSupportTicketSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, "Topic is required")
    .refine(isValidSupportTopic, { message: "Invalid topic" }),
  subject: z
    .string()
    .trim()
    .min(4, "Subject must be at least 4 characters")
    .max(160, "Subject cannot exceed 160 characters"),
  affectedResourceType: optionalNullableTrimmedString,
  affectedResourceId: optionalNullableTrimmedString,
  affectedResourceName: optionalNullableTrimmedString,
  description: descriptionSchema,
});

export const updateSupportTicketSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, "Topic is required")
    .refine(isValidSupportTopic, { message: "Invalid topic" })
    .optional(),
  subject: z
    .string()
    .trim()
    .min(4, "Subject must be at least 4 characters")
    .max(160, "Subject cannot exceed 160 characters")
    .optional(),
  description: descriptionSchema.optional(),
  affectedResourceType: optionalNullableTrimmedString,
  affectedResourceId: optionalNullableTrimmedString,
  affectedResourceName: optionalNullableTrimmedString,
  action: z.literal("reopen").optional(),
});

export const supportAttachmentDeleteSchema = z.object({
  attachmentId: z.string().trim().min(1, "attachmentId is required"),
});

export const supportTicketReplySchema = z.object({
  // Measured as TEXT, not markup — the reply composer sends editor HTML now,
  // and a plain .max() on the string would count every tag against the
  // customer's limit. A formatted reply and the same words typed flat should
  // hit the ceiling at the same point. Matches descriptionSchema above.
  message: z
    .string()
    .refine((value) => getSupportRichTextLength(value) >= 2, {
      message: "Message must be at least 2 characters",
    })
    .refine((value) => getSupportRichTextLength(value) <= 8000, {
      message: "Message cannot exceed 8000 characters",
    }),
});

export const supportTicketIdParamSchema = z.object({
  ticketId: z.string().trim().min(1, "ticketId is required"),
});

export const adminSupportTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.union([z.literal("all"), supportTicketStatusSchema]).default("all"),
  topic: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export const adminSupportTicketPatchSchema = z
  .object({
    status: supportTicketStatusSchema.optional(),
    reply: z.string().min(2, "Reply must be at least 2 characters").optional(),
  })
  .refine((data) => Boolean(data.status || data.reply), {
    message: "No update payload provided",
    path: ["status"],
  });

export type CreateSupportTicketPayload = z.infer<typeof createSupportTicketSchema>;
export type UpdateSupportTicketPayload = z.infer<typeof updateSupportTicketSchema>;
export type AdminSupportTicketsQuery = z.infer<typeof adminSupportTicketsQuerySchema>;
