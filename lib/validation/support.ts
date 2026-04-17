import { z } from "zod";
import { getSupportTopicById, isValidSupportTopicSelection } from "@/lib/support/catalog";
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

export const createSupportTicketSchema = z
  .object({
    topic: z.string().trim().min(1, "Topic is required"),
    subTopic: z.string().trim().min(1, "Sub-topic is required"),
    tertiaryTopic: z.string().trim().min(1, "Tertiary-topic is required"),
    subject: z
      .string()
      .trim()
      .min(4, "Subject must be at least 4 characters")
      .max(160, "Subject cannot exceed 160 characters"),
    affectedResourceType: optionalNullableTrimmedString,
    affectedResourceId: optionalNullableTrimmedString,
    affectedResourceName: optionalNullableTrimmedString,
    description: descriptionSchema,
  })
  .superRefine((data, ctx) => {
    if (!isValidSupportTopicSelection(data.topic, data.subTopic, data.tertiaryTopic)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tertiaryTopic"],
        message: "Invalid topic selection",
      });
    }
  });

export const updateSupportTicketSchema = z
  .object({
    topic: z.string().trim().min(1, "Topic is required").optional(),
    subTopic: z.string().trim().min(1, "Sub-topic is required").optional(),
    tertiaryTopic: z.string().trim().min(1, "Tertiary-topic is required").optional(),
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
  })
  .superRefine((data, ctx) => {
    const topicFieldsProvided =
      data.topic !== undefined || data.subTopic !== undefined || data.tertiaryTopic !== undefined;

    if (!topicFieldsProvided) {
      return;
    }

    if (!data.topic || !data.subTopic || !data.tertiaryTopic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topic"],
        message: "Topic, sub-topic, and tertiary-topic must be updated together",
      });
      return;
    }

    if (!isValidSupportTopicSelection(data.topic, data.subTopic, data.tertiaryTopic)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tertiaryTopic"],
        message: "Invalid topic selection",
      });
    }
  });

export const supportAttachmentDeleteSchema = z.object({
  attachmentId: z.string().trim().min(1, "attachmentId is required"),
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
