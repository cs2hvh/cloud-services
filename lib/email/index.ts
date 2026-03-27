export { emailService, EmailService } from "@/lib/email/service";
export { emailTemplates } from "@/lib/email/templates";
export { getEmailConfig } from "@/lib/email/config";
export type {
  AccountCreatedEmailData,
  ApiKeyActivityEmailData,
  BillingNotificationEmailData,
  ConsultationRequestEmailData,
  DeploymentStatusEmailData,
  EmailVerificationEmailData,
  EmailSendOptions,
  EmailTemplateTag,
  EmailTemplateDataMap,
  EmailTemplateId,
  ForgotPasswordEmailData,
  NewLoginAlertEmailData,
  OtpEmailData,
  SendEmailResult,
  SuspiciousActivityEmailData,
  SystemAlertEmailData,
} from "@/lib/email/types";
