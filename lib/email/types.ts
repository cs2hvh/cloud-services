import type { ReactElement } from "react";

export type EmailRecipient = string | string[];
export type EmailTemplateTag = { name: string; value: string };

export interface SendEmailResult {
  success: boolean;
  message: string;
  id?: string;
  error?: unknown;
}

export interface EmailSendOptions<K extends EmailTemplateId = EmailTemplateId> {
  template: K;
  to: EmailRecipient;
  data: EmailTemplateDataMap[K];
  cc?: EmailRecipient;
  bcc?: EmailRecipient;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: EmailTemplateTag[];
}

export interface EmailTemplateDefinition<TData> {
  subject: (data: TData) => string;
  previewText: (data: TData) => string;
  render: (data: TData) => ReactElement;
  text?: (data: TData) => string;
  tags?: (data: TData) => EmailTemplateTag[];
}

export interface OtpEmailData {
  username: string;
  otp: string;
}

export interface ForgotPasswordEmailData {
  username: string;
  otp: string;
}

export interface AccountCreatedEmailData {
  username: string;
  email: string;
  loginUrl?: string;
}

export interface EmailVerificationEmailData {
  username: string;
  verificationUrl?: string;
  verificationCode?: string;
  expiresIn?: string;
}

export interface NewLoginAlertEmailData {
  username: string;
  device: string;
  location: string;
  loggedInAt: string;
  ipAddress?: string;
  reviewUrl?: string;
}

export interface ApiKeyActivityEmailData {
  username: string;
  keyName: string;
  action: "created" | "deleted";
  projectName?: string;
  happenedAt?: string;
  dashboardUrl?: string;
}

export interface SuspiciousActivityEmailData {
  username: string;
  activity: string;
  detectedAt: string;
  location?: string;
  ipAddress?: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface BillingNotificationEmailData {
  customerName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  status: "paid" | "due" | "overdue" | "failed";
  actionUrl?: string;
  actionLabel?: string;
  notes?: string;
}

export interface DeploymentStatusEmailData {
  customerName: string;
  serviceName: string;
  environment: string;
  status: "success" | "failed";
  deployedAt: string;
  deploymentId?: string;
  commitSha?: string;
  commitMessage?: string;
  logsUrl?: string;
  dashboardUrl?: string;
  errorMessage?: string;
}

export interface SystemAlertEmailData {
  customerName: string;
  alertTitle: string;
  severity: "info" | "warning" | "critical";
  serviceName: string;
  detectedAt: string;
  summary: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ConsultationRequestEmailData {
  requesterName: string;
  requesterEmail: string;
  serviceName: string;
  messageBody: string;
  submittedAt: string;
}

export interface SupportConversationEmailMessageData {
  actorType: "user" | "admin" | "system";
  actorLabel: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  body: string;
}

export interface SupportTicketCreatedEmailData {
  customerName: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketBody: string;
  createdAt: string;
  ticketUrl?: string;
  conversation: SupportConversationEmailMessageData[];
}

export interface SupportTicketReplyEmailData {
  customerName: string;
  ticketNumber: string;
  ticketSubject: string;
  latestReply: string;
  repliedAt: string;
  ticketStatus: string;
  ticketUrl?: string;
  conversation: SupportConversationEmailMessageData[];
}

export type InferenceEventName =
  | "finetune.succeeded"
  | "finetune.failed"
  | "batch.completed"
  | "batch.failed"
  | "serving_pod.ready"
  | "serving_pod.stopped"
  | "org.spend_threshold_reached";

export interface InferenceEventEmailData {
  recipientName: string;
  event: InferenceEventName;
  /** One-line summary shown above the details card. */
  summary: string;
  /** Key/value pairs rendered in the details card. */
  items: Array<{ label: string; value: string }>;
  /** Optional error block — shown only on .failed events. */
  errorMessage?: string;
  /** CTA button target; if omitted the CTA is hidden. */
  actionUrl?: string;
  actionLabel?: string;
  /** Inbox preview text — falls back to event heading. */
  preview?: string;
}

export interface EmailTemplateDataMap {
  otp: OtpEmailData;
  forgotPassword: ForgotPasswordEmailData;
  accountCreated: AccountCreatedEmailData;
  emailVerification: EmailVerificationEmailData;
  newLoginAlert: NewLoginAlertEmailData;
  apiKeyActivity: ApiKeyActivityEmailData;
  suspiciousActivity: SuspiciousActivityEmailData;
  billingNotification: BillingNotificationEmailData;
  deploymentStatus: DeploymentStatusEmailData;
  systemAlert: SystemAlertEmailData;
  consultationRequest: ConsultationRequestEmailData;
  supportTicketCreated: SupportTicketCreatedEmailData;
  supportTicketReply: SupportTicketReplyEmailData;
  inferenceEvent: InferenceEventEmailData;
}

export type EmailTemplateId = keyof EmailTemplateDataMap;

export type EmailTemplateRegistry = {
  [K in EmailTemplateId]: EmailTemplateDefinition<EmailTemplateDataMap[K]>;
};
