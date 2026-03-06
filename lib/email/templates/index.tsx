import { BillingNotificationEmailTemplate } from "@/lib/email/templates/billing/billing-notification";
import { DeploymentStatusEmailTemplate } from "@/lib/email/templates/deployments/deployment-status";
import { ForgotPasswordEmailTemplate } from "@/lib/email/templates/auth/forgot-password";
import { OtpEmailTemplate } from "@/lib/email/templates/auth/otp";
import { SystemAlertEmailTemplate } from "@/lib/email/templates/alerts/system-alert";
import type { EmailTemplateRegistry } from "@/lib/email/types";

export const emailTemplates: EmailTemplateRegistry = {
  otp: {
    subject: () => "AhuraSense | Your OTP Code",
    previewText: () => "Use this code to complete your registration.",
    render: (data) => <OtpEmailTemplate {...data} />,
    text: ({ username, otp }) =>
      `Hi ${username}, use OTP ${otp} to complete your registration.`,
    tags: () => [{ name: "category", value: "auth" }],
  },
  forgotPassword: {
    subject: () => "AhuraSense | Your Password Reset OTP",
    previewText: () => "Use this code to reset your password.",
    render: (data) => <ForgotPasswordEmailTemplate {...data} />,
    text: ({ username, otp }) =>
      `Hi ${username}, use OTP ${otp} to reset your password.`,
    tags: () => [{ name: "category", value: "auth" }],
  },
  billingNotification: {
    subject: ({ invoiceNumber, status }) =>
      `AhuraSense | Billing ${status} for invoice ${invoiceNumber}`,
    previewText: ({ invoiceNumber }) =>
      `Billing update available for invoice ${invoiceNumber}.`,
    render: (data) => <BillingNotificationEmailTemplate {...data} />,
    text: ({ customerName, invoiceNumber, amount, dueDate, status }) =>
      `Hi ${customerName}, invoice ${invoiceNumber} is ${status}. Amount: ${amount}. Due date: ${dueDate}.`,
    tags: ({ status }) => [
      { name: "category", value: "billing" },
      { name: "status", value: status },
    ],
  },
  deploymentStatus: {
    subject: ({ serviceName, status, environment }) =>
      `AhuraSense | ${serviceName} deployment ${status} on ${environment}`,
    previewText: ({ serviceName, status }) =>
      `${serviceName} deployment ${status}.`,
    render: (data) => <DeploymentStatusEmailTemplate {...data} />,
    text: ({ customerName, serviceName, environment, status }) =>
      `Hi ${customerName}, deployment for ${serviceName} on ${environment} finished with status ${status}.`,
    tags: ({ status, environment }) => [
      { name: "category", value: "deployments" },
      { name: "status", value: status },
      { name: "environment", value: environment },
    ],
  },
  systemAlert: {
    subject: ({ severity, alertTitle }) =>
      `AhuraSense | ${severity.toUpperCase()} alert: ${alertTitle}`,
    previewText: ({ serviceName }) => `System alert for ${serviceName}.`,
    render: (data) => <SystemAlertEmailTemplate {...data} />,
    text: ({ customerName, alertTitle, serviceName, severity }) =>
      `Hi ${customerName}, ${severity} alert "${alertTitle}" was triggered for ${serviceName}.`,
    tags: ({ severity }) => [
      { name: "category", value: "alerts" },
      { name: "severity", value: severity },
    ],
  },
};
