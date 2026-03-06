import type { ReactElement } from "react";

export type EmailRecipient = string | string[];

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
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailTemplateDefinition<TData> {
  subject: (data: TData) => string;
  previewText: (data: TData) => string;
  render: (data: TData) => ReactElement;
  text?: (data: TData) => string;
  tags?: (data: TData) => Array<{ name: string; value: string }>;
}

export interface OtpEmailData {
  username: string;
  otp: string;
}

export interface ForgotPasswordEmailData {
  username: string;
  otp: string;
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

export interface EmailTemplateDataMap {
  otp: OtpEmailData;
  forgotPassword: ForgotPasswordEmailData;
  billingNotification: BillingNotificationEmailData;
  deploymentStatus: DeploymentStatusEmailData;
  systemAlert: SystemAlertEmailData;
}

export type EmailTemplateId = keyof EmailTemplateDataMap;

export type EmailTemplateRegistry = {
  [K in EmailTemplateId]: EmailTemplateDefinition<EmailTemplateDataMap[K]>;
};
